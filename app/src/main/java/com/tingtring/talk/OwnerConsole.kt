package com.tingtring.talk

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import com.tingtring.talk.data.ApiClient
import com.tingtring.talk.data.TttUser
import kotlinx.coroutines.launch

@Composable
fun OwnerConsole(api: ApiClient, modifier: Modifier = Modifier) {
    var query by rememberSaveable { mutableStateOf("") }
    var results by remember { mutableStateOf<List<TttUser>>(emptyList()) }
    var selected by remember { mutableStateOf<TttUser?>(null) }
    var newId by rememberSaveable { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var ownerTarget by remember { mutableStateOf<TttUser?>(null) }
    var ownerConfirmStep by rememberSaveable { mutableIntStateOf(0) }
    var ownerPassword by rememberSaveable { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    Column(modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Owner Console", style = MaterialTheme.typography.headlineLarge)
        Text("Server-authorized administration", style = MaterialTheme.typography.bodyMedium)
        OutlinedTextField(value = query, onValueChange = { query = it }, label = { Text("Search username, email, or TingTring ID") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Button(enabled = query.trim().length >= 3 && !loading, onClick = {
            scope.launch {
                loading = true; error = null; message = null
                val r = api.ownerSearchUsers(query)
                results = r.value ?: emptyList()
                error = r.error
                loading = false
            }
        }, modifier = Modifier.fillMaxWidth()) { Text(if (loading) "Searching…" else "Search users") }

        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }

        selected?.let { user ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(user.displayName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("@${user.username}")
                    Text("Current ID: ${user.tttUserId}")
                    Text("Plan: ${user.plan}")
                    Text("Status: ${user.status}")
                    OutlinedTextField(value = newId, onValueChange = { newId = it.lowercase() }, label = { Text("New TingTring ID") }, supportingText = { Text("Exactly 10 digits") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedButton(onClick={ownerTarget=user;ownerConfirmStep=1;ownerPassword=""},enabled=user.plan!="OWNER"&&!loading){Text("Grant Owner access")}
                    Button(enabled = newId.matches(Regex("\\d{10}")) && newId != user.tttUserId && !loading, onClick = {
                        scope.launch {
                            loading = true; error = null; message = null
                            val r = api.ownerChangeTttId(user.id, newId)
                            if (r.value != null) {
                                message = "ID changed from ${r.value.first} to ${r.value.second}. Existing contacts follow the account."
                                selected = user.copy(tttUserId = r.value.second)
                                newId = ""
                                results = results.map { if (it.id == user.id) it.copy(tttUserId = r.value.second) else it }
                            } else error = r.error
                            loading = false
                        }
                    }, modifier = Modifier.fillMaxWidth()) { Text("Change TingTring ID") }
                }
            }
        }

        ownerTarget?.let { target ->
            AlertDialog(onDismissRequest={ownerTarget=null;ownerConfirmStep=0;ownerPassword=""},title={Text("Grant Owner access")},
                text={if(ownerConfirmStep<10) Text("Confirmation " + ownerConfirmStep + " of 10. You are explicitly authorizing Owner access.") else Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
                    Text("Final step: enter your current account password.")
                    Row(horizontalArrangement=Arrangement.spacedBy(4.dp)){repeat(8){index->OutlinedTextField(value=ownerPassword.getOrNull(index)?.toString()?:"",onValueChange={v->val d=v.filter{it.isDigit()}.takeLast(1);val chars=ownerPassword.toMutableList();while(chars.size<=index)chars.add(" "[0]);if(d.isNotEmpty())chars[index]=d[0];ownerPassword=chars.joinToString("").trimEnd()},modifier=Modifier.width(42.dp),singleLine=true,visualTransformation=PasswordVisualTransformation(),keyboardOptions=androidx.compose.foundation.text.KeyboardOptions(keyboardType=KeyboardType.Number))}}
                    Text("The password is verified server-side and is not stored.")
                }},
                confirmButton={Button(enabled=!loading&&(ownerConfirmStep<10||ownerPassword.isNotBlank()),onClick={if(ownerConfirmStep<10)ownerConfirmStep++ else scope.launch{loading=true;val r=api.grantOwner(target.id,ownerPassword);if(r.error==null){message="Owner access granted.";selected=target.copy(plan="OWNER");results=results.map{if(it.id==target.id)it.copy(plan="OWNER")else it};ownerTarget=null;ownerConfirmStep=0;ownerPassword=""}else error=r.error;loading=false}}){Text(if(ownerConfirmStep<10)"I confirm" else "Grant Owner")}},
                dismissButton={TextButton(onClick={ownerTarget=null;ownerConfirmStep=0;ownerPassword=""}){Text("Cancel")}})
        }
        Text("Results", style = MaterialTheme.typography.titleLarge)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(results) { user ->
                OutlinedCard(onClick = { selected = user; newId = ""; error = null; message = null }, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(user.displayName, fontWeight = FontWeight.SemiBold)
                        Text("@${user.username} • ${user.tttUserId}")
                        Text(user.plan, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            if (results.isEmpty()) item { Text("No users found yet.") }
        }
    }
}

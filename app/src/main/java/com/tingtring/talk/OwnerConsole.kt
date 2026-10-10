package com.tingtring.talk

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tingtring.talk.data.ApiClient
import com.tingtring.talk.data.TttUser
import kotlinx.coroutines.launch

@Composable
fun OwnerConsole(api: ApiClient, modifier: Modifier = Modifier) {
    var query by rememberSaveable { mutableStateOf("") }
    var users by remember { mutableStateOf<List<TttUser>>(emptyList()) }
    var selected by remember { mutableStateOf<TttUser?>(null) }
    var newId by rememberSaveable { mutableStateOf("") }
    var counts by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var ownerCount by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    var ownerTarget by remember { mutableStateOf<TttUser?>(null) }
    var ownerConfirmStep by rememberSaveable { mutableIntStateOf(0) }
    var ownerPassword by rememberSaveable { mutableStateOf("") }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var totalRecords by remember { mutableIntStateOf(0) }
    var hasMore by remember { mutableStateOf(false) }
    var searchMode by rememberSaveable { mutableStateOf(false) }
    val pageSize = 50
    val scope = rememberCoroutineScope()

    fun refresh(requestedPage: Int = page) {
        scope.launch {
            loading = true
            error = null
            val r = api.ownerDashboard(requestedPage, pageSize)
            if (r.value != null) {
                users = r.value.users
                page = r.value.page
                totalRecords = r.value.totalRecords
                hasMore = r.value.hasMore
                searchMode = false
                counts = mapOf("Total" to r.value.total, "Active" to r.value.active, "Suspended" to r.value.suspended,
                    "Free" to r.value.free, "Pro" to r.value.pro, "Premium" to r.value.premium, "Owners" to r.value.owners)
            } else error = r.error
            val owners = api.ownerCount()
            ownerCount = owners.value
            loading = false
        }
    }
    LaunchedEffect(Unit) { refresh(1) }

    Column(modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Owner Console", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text("Private user management • Server-authorized", style = MaterialTheme.typography.bodyMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = { refresh() }, enabled = !loading, modifier = Modifier.weight(1f)) { Text(if (loading) "Loading…" else "Refresh") }
            ownerCount?.let { (count, limit) -> AssistChip(onClick = {}, label = { Text("Owners $count/$limit") }) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            listOf("Total", "Active", "Suspended").forEach { label ->
                Card(Modifier.weight(1f)) { Column(Modifier.padding(10.dp)) {
                    Text(label, style = MaterialTheme.typography.labelSmall)
                    Text((counts[label] ?: 0).toString(), style = MaterialTheme.typography.headlineSmall)
                } }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            listOf("Free", "Pro", "Premium").forEach { label ->
                Card(Modifier.weight(1f)) { Column(Modifier.padding(10.dp)) {
                    Text(label, style = MaterialTheme.typography.labelSmall)
                    Text((counts[label] ?: 0).toString(), style = MaterialTheme.typography.titleLarge)
                } }
            }
        }
        com.tingtring.talk.ui.VanyaCorrectionField(
            value = query, onValueChange = { query = it },
            label = "Search username, email, or TingTring ID", modifier = Modifier.fillMaxWidth()
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Button(enabled = query.trim().length >= 3 && !loading, onClick = {
                scope.launch {
                    loading = true; error = null; message = null; searchMode = true
                    val r = api.ownerSearchUsers(query.trim())
                    if (r.value != null) {
                        users = r.value
                        selected = null
                    } else error = r.error
                    loading = false
                }
            }, modifier = Modifier.weight(1f)) { Text("Search") }
            OutlinedButton(enabled = !loading, onClick = { query = ""; refresh(1) }) { Text("All users") }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }

        selected?.let { user ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("User details", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(user.displayName, style = MaterialTheme.typography.titleMedium)
                    Text("@${user.username} • TTT ID: ${user.tttUserId}")
                    Text("Email: ${user.email ?: "Not available"}")
                    Text("Plan: ${user.plan} • Status: ${user.status}")
                    Text("Joined: ${user.createdAt ?: "Unknown"}", style = MaterialTheme.typography.bodySmall)
                    Text("Last seen: ${user.lastSeenAt ?: "Not recorded"}", style = MaterialTheme.typography.bodySmall)
                    if (user.plan != "OWNER") {
                        Text("Set subscription", style = MaterialTheme.typography.titleSmall)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                            listOf("FREE", "PRO", "PREMIUM").forEach { plan ->
                                OutlinedButton(enabled = !loading && user.plan != plan, onClick = {
                                    scope.launch {
                                        loading = true; error = null; message = null
                                        val r = api.ownerSetPlan(user.id, plan)
                                        if (r.error == null) {
                                            message = "Plan updated to $plan."
                                            selected = user.copy(plan = plan)
                                            users = users.map { if (it.id == user.id) it.copy(plan = plan) else it }
                                            refresh()
                                        } else error = r.error
                                        loading = false
                                    }
                                }, modifier = Modifier.weight(1f)) { Text(plan) }
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            Button(enabled = !loading && user.status != "SUSPENDED", onClick = {
                                scope.launch {
                                    loading = true; error = null
                                    val r = api.ownerSetStatus(user.id, "SUSPENDED")
                                    if (r.error == null) { message = "Account suspended."; selected = user.copy(status = "SUSPENDED"); refresh() } else error = r.error
                                    loading = false
                                }
                            }, modifier = Modifier.weight(1f)) { Text("Suspend") }
                            OutlinedButton(enabled = !loading && user.status != "ACTIVE", onClick = {
                                scope.launch {
                                    loading = true; error = null
                                    val r = api.ownerSetStatus(user.id, "ACTIVE")
                                    if (r.error == null) { message = "Account reactivated."; selected = user.copy(status = "ACTIVE"); refresh() } else error = r.error
                                    loading = false
                                }
                            }, modifier = Modifier.weight(1f)) { Text("Reactivate") }
                        }
                        com.tingtring.talk.ui.VanyaCorrectionField(
                            value = newId, onValueChange = { newId = it.filter(Char::isDigit).take(10) },
                            label = "New 10-digit TTT ID", keyboardType = KeyboardType.Number, modifier = Modifier.fillMaxWidth()
                        )
                        Button(enabled = newId.matches(Regex("\\d{10}")) && newId != user.tttUserId && !loading, onClick = {
                            scope.launch {
                                loading = true; error = null; message = null
                                val r = api.ownerChangeTttId(user.id, newId)
                                if (r.value != null) {
                                    message = "ID changed. Existing contacts follow the account."
                                    selected = user.copy(tttUserId = r.value.second)
                                    newId = ""
                                    refresh()
                                } else error = r.error
                                loading = false
                            }
                        }, modifier = Modifier.fillMaxWidth()) { Text("Change TTT ID") }
                        OutlinedButton(onClick = { ownerTarget = user; ownerConfirmStep = 1; ownerPassword = "" },
                            enabled = !loading, modifier = Modifier.fillMaxWidth()) { Text("Grant Owner access…") }
                    } else {
                        Text("Owner account protected from plan and status changes.", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        Text(
            if (searchMode) "Search results (${users.size})" else "Users ($totalRecords total)",
            style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold
        )
        if (!searchMode) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                OutlinedButton(enabled = page > 1 && !loading, onClick = { refresh(page - 1) }) { Text("Previous") }
                Text("Page $page · ${users.size} shown", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                Button(enabled = hasMore && !loading, onClick = { refresh(page + 1) }) { Text("Next") }
            }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f, fill = false)) {
            items(users, key = { it.id }) { user ->
                OutlinedCard(onClick = { selected = user; newId = ""; error = null; message = null }, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(user.displayName, fontWeight = FontWeight.SemiBold)
                        Text("@${user.username} • ${user.tttUserId}")
                        Text("${user.plan} • ${user.status}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            if (users.isEmpty()) item { Text(if (loading) "Loading users…" else "No users loaded. Tap Refresh.") }
        }
    }

    ownerTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { ownerTarget = null; ownerConfirmStep = 0; ownerPassword = "" },
            title = { Text("Grant Owner access") },
            text = {
                if (ownerConfirmStep < 10) Text("Confirmation $ownerConfirmStep of 10. You are explicitly authorizing Owner access for @${target.username}.")
                else Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Final step: enter your current account password.")
                    OutlinedTextField(value = ownerPassword, onValueChange = { ownerPassword = it.take(128) },
                        label = { Text("Current password") }, singleLine = true)
                    Text("Password is verified server-side and is not stored.")
                }
            },
            confirmButton = {
                Button(enabled = !loading && (ownerConfirmStep < 10 || ownerPassword.isNotBlank()), onClick = {
                    if (ownerConfirmStep < 10) ownerConfirmStep++ else scope.launch {
                        loading = true
                        val r = api.grantOwner(target.id, ownerPassword)
                        if (r.error == null) {
                            message = "Owner access granted."
                            selected = target.copy(plan = "OWNER")
                            ownerTarget = null; ownerConfirmStep = 0; ownerPassword = ""
                            refresh()
                        } else error = r.error
                        loading = false
                    }
                }) { Text(if (ownerConfirmStep < 10) "I confirm" else "Grant Owner") }
            },
            dismissButton = { TextButton(onClick = { ownerTarget = null; ownerConfirmStep = 0; ownerPassword = "" }) { Text("Cancel") } }
        )
    }
}

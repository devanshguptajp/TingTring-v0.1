package com.tingtring.talk

import android.os.Bundle
import android.Manifest
import android.content.pm.PackageManager
import android.content.ComponentName
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.tingtring.talk.data.*
import com.tingtring.talk.ui.theme.TingTringTheme
import kotlinx.coroutines.launch
import io.livekit.android.LiveKit

private const val API_BASE_URL="http://10.0.2.2:3000"

class MainActivity:ComponentActivity(){
 override fun onCreate(state:Bundle?){super.onCreate(state);registerTttPhoneAccount();val session=SessionStore(this);val api=ApiClient(API_BASE_URL,session);setContent{TingTringTheme{App(api,session)}}}
 private fun registerTttPhoneAccount(){
  val telecom=getSystemService(TelecomManager::class.java)
  val component=ComponentName(this,com.tingtring.talk.telecom.TttConnectionService::class.java)
  val handle=PhoneAccountHandle(component,"tingtring_talk")
  val account=PhoneAccount.builder(handle,"TingTring Talk")
   .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
   .build()
  runCatching{telecom.registerPhoneAccount(account)}
 }
}

@Composable private fun App(api:ApiClient,session:SessionStore){
 var user by remember{mutableStateOf<TttUser?>(null)};var activeCall by remember{mutableStateOf<CallSession?>(null)};var checking by remember{mutableStateOf(session.accessToken!=null)}
 LaunchedEffect(Unit){if(session.accessToken!=null){val r=api.me();user=r.value;if(r.value==null)session.clear()};checking=false}
 if(checking)Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){CircularProgressIndicator()}
 else if(user==null)AuthScreen(api){user=it}else if(activeCall!=null)CallScreen(api,activeCall!!){activeCall=null}else MainShell(api,user!!){user=null;session.clear()}
}

@Composable private fun AuthScreen(api:ApiClient,onSignedIn:(TttUser)->Unit){
 var mode by rememberSaveable{mutableStateOf("login")};var email by rememberSaveable{mutableStateOf("")};var password by rememberSaveable{mutableStateOf("")};var username by rememberSaveable{mutableStateOf("")};var display by rememberSaveable{mutableStateOf("")};var otp by rememberSaveable{mutableStateOf("")};var sent by rememberSaveable{mutableStateOf(false)};var loading by remember{mutableStateOf(false)};var error by remember{mutableStateOf<String?>(null)};val scope=rememberCoroutineScope()
 fun submit(){loading=true;error=null;scope.launch{val r=when{mode=="forgot"->{val x=api.resetPassword(email);if(x.error==null)error="Reset email requested";x};mode=="signup"->api.signup(email,password,username,display);mode=="otp"&&!sent->{val x=api.startOtp(email);if(x.error==null)sent=true;x};mode=="otp"->api.verifyOtp(email,otp);else->api.passwordLogin(email,password)};if(r.value!=null)onSignedIn(r.value);error=r.error;loading=false}}
 Surface(Modifier.fillMaxSize()){Column(Modifier.fillMaxSize().padding(28.dp),verticalArrangement=Arrangement.Center){
  Text("TingTring",style=MaterialTheme.typography.headlineLarge);Text("Talk",style=MaterialTheme.typography.headlineMedium,color=MaterialTheme.colorScheme.primary);Text("Internet calling. No SIM. No phone number.",style=MaterialTheme.typography.bodyLarge)
  Spacer(Modifier.height(24.dp));if(mode=="signup"){Field(username, {username=it},"Username");Spacer(Modifier.height(10.dp));Field(display,{display=it},"Display name");Spacer(Modifier.height(10.dp))}
  Field(email,{email=it},"Email",KeyboardType.Email);if(mode!="otp"&&mode!="forgot"){Spacer(Modifier.height(10.dp));Field(password,{password=it},"Password",KeyboardType.Password,true)};if(mode=="otp"&&sent){Spacer(Modifier.height(10.dp));Field(otp,{otp=it},"6-digit code",KeyboardType.Number)}
  error?.let{Text(it,color=MaterialTheme.colorScheme.error,modifier=Modifier.padding(top=8.dp))};Spacer(Modifier.height(14.dp))
  Button(::submit,enabled=!loading,modifier=Modifier.fillMaxWidth().height(52.dp)){if(loading)CircularProgressIndicator(Modifier.size(20.dp),color=MaterialTheme.colorScheme.onPrimary)else Text(if(mode=="otp"&&sent)"Verify code"else if(mode=="signup")"Create account"else if(mode=="otp")"Send code"else if(mode=="forgot")"Send reset email"else"Sign in")}
  TextButton(onClick={mode=when(mode){"login"->"otp";"otp"->"forgot";"forgot"->"login";else->"login"};sent=false;error=null},modifier=Modifier.fillMaxWidth()){Text(when(mode){"login"->"Use email OTP";"otp"->"Forgot password?";"forgot"->"Back to sign in";else->"Already have an account? Sign in"})}
 }}
}
@Composable private fun Field(value:String,onChange:(String)->Unit,label:String,type:KeyboardType=KeyboardType.Text,password:Boolean=false)=OutlinedTextField(value,onChange,label={Text(label)},singleLine=true,modifier=Modifier.fillMaxWidth(),keyboardOptions=KeyboardOptions(keyboardType=type),visualTransformation=if(password)PasswordVisualTransformation()else androidx.compose.ui.text.input.VisualTransformation.None)

@Composable private fun MainShell(api:ApiClient,user:TttUser,onLogout:()->Unit){
 var selected by rememberSaveable{mutableIntStateOf(0)};Scaffold(bottomBar={NavigationBar{
  NavigationBarItem(selected==0,{selected=0},{Icon(Icons.Default.Home,null)},label={Text("Home")});NavigationBarItem(selected==1,{selected=1},{Icon(Icons.Default.People,null)},label={Text("Contacts")});NavigationBarItem(selected==2,{selected=2},{Icon(Icons.Default.Person,null)},label={Text("Profile")})
 }}){p->when(selected){0->Home(user,Modifier.padding(p));1->Contacts(api,Modifier.padding(p));2->Profile(api,user,onLogout,Modifier.padding(p))}}
}
@Composable private fun Home(user:TttUser,modifier:Modifier=Modifier)=Column(modifier.fillMaxSize().padding(22.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
 Text("Good to see you.",style=MaterialTheme.typography.titleMedium);Text(user.displayName,style=MaterialTheme.typography.headlineLarge)
 Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(24.dp),colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.primaryContainer)){Column(Modifier.padding(22.dp)){Text("Your TingTring ID",style=MaterialTheme.typography.titleMedium);Text(user.tttUserId,style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold);Text("@"+user.username)}}
 Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(20.dp)){Column(Modifier.padding(20.dp)){Text("Calling is next",style=MaterialTheme.typography.titleLarge);Text("Your identity, contacts and account are ready for the calling system.")}}
}

@Composable private fun Contacts(api:ApiClient,modifier:Modifier=Modifier){
 var query by rememberSaveable{mutableStateOf("")};var results by remember{mutableStateOf<List<TttUser>>(emptyList())};var contacts by remember{mutableStateOf<List<Contact>>(emptyList())};var error by remember{mutableStateOf<String?>(null)};val scope=rememberCoroutineScope()
 LaunchedEffect(Unit){contacts=api.contacts().value?:emptyList()}
 Column(modifier.fillMaxSize().padding(18.dp)){Text("Contacts",style=MaterialTheme.typography.headlineLarge);Spacer(Modifier.height(12.dp));OutlinedTextField(query,{query=it},label={Text("Username or 10-digit ID")},singleLine=true,modifier=Modifier.fillMaxWidth())
 Spacer(Modifier.height(8.dp));Button(onClick={scope.launch{val r=api.search(query);results=r.value?:emptyList();error=r.error}},enabled=query.length>=3){Icon(Icons.Default.Search,null);Spacer(Modifier.width(8.dp));Text("Search")}
 error?.let{Text(it,color=MaterialTheme.colorScheme.error,modifier=Modifier.padding(8.dp))}
 LazyColumn(verticalArrangement=Arrangement.spacedBy(8.dp),contentPadding=PaddingValues(vertical=12.dp)){items(results){u->UserRow(u,"Add"){scope.launch{val r=api.addContact(u.tttUserId);error=r.error;if(r.error==null)contacts=api.contacts().value?:contacts}}};if(results.isEmpty())item{Text("Saved contacts",style=MaterialTheme.typography.titleLarge)};items(contacts){c->UserRow(c.user,"Remove"){scope.launch{val r=api.removeContact(c.id);error=r.error;if(r.error==null)contacts=api.contacts().value?:contacts}}}}}
}
@Composable private fun UserRow(user:TttUser,action:String,onAction:()->Unit)=Card(Modifier.fillMaxWidth()){Row(Modifier.fillMaxWidth().padding(14.dp),verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(user.displayName,fontWeight=FontWeight.SemiBold);Text("@"+user.username+" • "+user.tttUserId,style=MaterialTheme.typography.bodySmall)};TextButton(onClick=onAction){Text(action)}}}

@Composable private fun Profile(api:ApiClient,user:TttUser,onLogout:()->Unit,modifier:Modifier=Modifier){
 val scope=rememberCoroutineScope();Column(modifier.fillMaxSize().padding(22.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){Text("Profile",style=MaterialTheme.typography.headlineLarge);Text(user.displayName,style=MaterialTheme.typography.titleLarge);Text("@"+user.username);Text("TingTring ID: "+user.tttUserId);Text("Plan: "+user.plan);Spacer(Modifier.height(12.dp));OutlinedButton(onClick={scope.launch{api.logout();onLogout()}},modifier=Modifier.fillMaxWidth()){Text("Sign out")}}
}


@Composable private fun CallScreen(api:ApiClient,session:CallSession,onEnded:()->Unit){
 val context=LocalContext.current
 var connected by remember{mutableStateOf(false)}
 var muted by remember{mutableStateOf(false)}
 var error by remember{mutableStateOf<String?>(null)}
 val scope=rememberCoroutineScope()
 val room=remember{LiveKit.create(appContext=context.applicationContext)}
 DisposableEffect(Unit){
  onDispose{runCatching{room.disconnect();room.release()}}
 }
 LaunchedEffect(session.callId){
  if(androidx.core.content.ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
   error="Microphone permission is required"
   return@LaunchedEffect
  }
  try{
   room.connect(session.livekitUrl,session.token)
   if(!room.localParticipant.setMicrophoneEnabled(true)) throw IllegalStateException("MICROPHONE_ENABLE_FAILED")
   connected=true
  }catch(t:Throwable){error=t.message?:"CALL_CONNECTION_FAILED"}
 }
 Column(Modifier.fillMaxSize().padding(28.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
  Text("TingTring Call",style=MaterialTheme.typography.headlineLarge)
  Spacer(Modifier.height(12.dp))
  Text(if(error!=null)"Call failed"else if(connected)"Connected"else"Connecting…")
  error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
  Spacer(Modifier.height(28.dp))
  Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
   OutlinedButton(enabled=connected,onClick={scope.launch{muted=!muted;room.localParticipant.setMicrophoneEnabled(!muted)}}){Text(if(muted)"Unmute"else"Mute")}
   Button(onClick={scope.launch{api.endCall(session.callId);room.disconnect();onEnded()}}){Text("End call")}
  }
 }
}

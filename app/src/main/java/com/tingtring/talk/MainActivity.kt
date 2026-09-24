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
import androidx.activity.compose.rememberLauncherForActivityResult
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
import androidx.compose.material.icons.filled.Settings
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
import com.tingtring.talk.ui.VanyaCorrectionField
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
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
 LaunchedEffect(Unit){
  if(session.accessToken!=null){
    var r=api.me()
    if(r.value==null && session.refreshToken!=null) r=api.refreshSession()
    user=r.value
    if(r.value==null)session.clear()
  }
  checking=false
}
 if(checking)Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){CircularProgressIndicator()}
 else if(user==null)AuthScreen(api){user=it}else if(activeCall!=null)CallScreen(api,activeCall!!){activeCall=null}else MainShell(api,user!!,{activeCall=it}){user=null;session.clear()}
}

@Composable private fun AuthScreen(api:ApiClient,onSignedIn:(TttUser)->Unit){
 var mode by rememberSaveable{mutableStateOf("login")}
 var email by rememberSaveable{mutableStateOf("")}
 var password by rememberSaveable{mutableStateOf("")}
 var username by rememberSaveable{mutableStateOf("")}
 var display by rememberSaveable{mutableStateOf("")}
 var otp by rememberSaveable{mutableStateOf("")}
 var sent by rememberSaveable{mutableStateOf(false)}
 var loading by remember{mutableStateOf(false)}
 var error by remember{mutableStateOf<String?>(null)}
 val scope=rememberCoroutineScope()

 fun submit(){
  loading=true;error=null
  scope.launch{
   when{
    mode=="forgot"->{val r=api.resetPassword(email);if(r.error!=null)error=r.error}
    mode=="signup"->{val r=api.signup(email,password,username,display);if(r.value!=null)onSignedIn(r.value)else if(r.error=="EMAIL_VERIFICATION_REQUIRED"){mode="otp";sent=false;error="Check your email, then request a 6-digit code to finish signing in."}else error=r.error}
    mode=="otp"&&!sent->{val r=api.startOtp(email);if(r.error==null)sent=true else error=r.error}
    mode=="otp"->{val r=api.verifyOtp(email,otp);if(r.value!=null)onSignedIn(r.value)else error=r.error}
    else->{val r=api.passwordLogin(email,password);if(r.value!=null)onSignedIn(r.value)else error=r.error}
   }
   loading=false
  }
 }

 val title=when(mode){"signup"->"Create your account";"forgot"->"Reset your password";"otp"->if(sent)"Verify your email"else"Sign in with OTP";else->"Welcome back"}
 val subtitle=when(mode){"signup"->"Set up your TingTring identity."; "forgot"->"We’ll send a secure reset email."; "otp"->if(sent)"Enter the 6-digit code we sent."else"Password-free sign in."; else->"Your calls. Your identity. Over the internet."}

 Surface(Modifier.fillMaxSize(),color=MaterialTheme.colorScheme.background){
  BoxWithConstraints(Modifier.fillMaxSize()){
   val compact=maxWidth<600.dp
   Row(Modifier.fillMaxSize()){
    if(!compact){
     Surface(Modifier.weight(0.9f).fillMaxHeight(),color=MaterialTheme.colorScheme.primary){
      Column(Modifier.fillMaxSize().padding(48.dp),verticalArrangement=Arrangement.Center){
       Text("TingTring",style=MaterialTheme.typography.displaySmall,color=MaterialTheme.colorScheme.onPrimary,fontWeight=FontWeight.Bold)
       Text("Talk",style=MaterialTheme.typography.displayMedium,color=MaterialTheme.colorScheme.onPrimary,fontWeight=FontWeight.Bold)
       Spacer(Modifier.height(18.dp))
       Text("Internet calling, without a SIM or traditional phone number.",style=MaterialTheme.typography.titleLarge,color=MaterialTheme.colorScheme.onPrimary.copy(alpha=.88f))
       Spacer(Modifier.height(34.dp))
       Card(shape=RoundedCornerShape(28.dp),colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.onPrimary.copy(alpha=.10f))){
        Column(Modifier.padding(22.dp)){Text("One simple identity",fontWeight=FontWeight.Bold,color=MaterialTheme.colorScheme.onPrimary);Text("Your unique 10-digit TingTring ID is all you need to connect.",color=MaterialTheme.colorScheme.onPrimary.copy(alpha=.86f),modifier=Modifier.padding(top=6.dp))}
       }
      }
     }
    }
    Column(Modifier.weight(1.1f).fillMaxHeight().padding(horizontal=if(compact)24.dp else 56.dp,vertical=if(compact)28.dp else 48.dp),verticalArrangement=Arrangement.Center){
     Text(title,style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold)
     Text(subtitle,style=MaterialTheme.typography.bodyLarge,color=MaterialTheme.colorScheme.onSurfaceVariant,modifier=Modifier.padding(top=6.dp,bottom=22.dp))

     if(mode=="signup"){
      VanyaCorrectionField(username,{username=it},"Username",keyboardType=KeyboardType.Text,enabled=!loading)
      Spacer(Modifier.height(10.dp))
      VanyaCorrectionField(display,{display=it},"Display name",keyboardType=KeyboardType.Text,enabled=!loading)
      Spacer(Modifier.height(10.dp))
     }
     VanyaCorrectionField(email,{email=it},"Email",keyboardType=KeyboardType.Email,enabled=!loading)
     if(mode!="otp"&&mode!="forgot"){
      Spacer(Modifier.height(10.dp))
      VanyaCorrectionField(password,{password=it},"Password",keyboardType=KeyboardType.Password,password=true,enabled=!loading)
     }
     if(mode=="otp"&&sent){
      Spacer(Modifier.height(10.dp))
      VanyaCorrectionField(otp,{otp=it},"6-digit code",keyboardType=KeyboardType.Number,enabled=!loading)
     }
     error?.let{Text(it,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodyMedium,modifier=Modifier.padding(top=10.dp))}
     Spacer(Modifier.height(16.dp))
     Button(onClick=::submit,enabled=!loading,modifier=Modifier.fillMaxWidth().height(54.dp),shape=RoundedCornerShape(17.dp)){
      if(loading)CircularProgressIndicator(Modifier.size(20.dp),color=MaterialTheme.colorScheme.onPrimary)
      else Text(when(mode){"otp"->if(sent)"Verify code"else"Send code";"signup"->"Create account";"forgot"->"Send reset email";else->"Sign in"},fontWeight=FontWeight.SemiBold)
     }
     TextButton(
      onClick={mode=when(mode){"login"->"otp";"otp"->"forgot";"forgot"->"login";else->"login"};sent=false;error=null},
      enabled=!loading,modifier=Modifier.fillMaxWidth()
     ){
      Text(when(mode){"login"->"Use email OTP";"otp"->"Forgot password?";"forgot"->"Back to sign in";else->"Already have an account? Sign in"})
     }
     if(mode=="login"){
      TextButton(onClick={mode="signup";error=null},enabled=!loading,modifier=Modifier.fillMaxWidth()){Text("Create a new TingTring account")}
     }
    }
   }
  }
 }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun MainShell(api:ApiClient,user:TttUser,onStartCall:(CallSession)->Unit,onLogout:()->Unit){
 var selected by rememberSaveable{mutableIntStateOf(0)}
 var incoming by remember{mutableStateOf<IncomingCall?>(null)}
 val scope=rememberCoroutineScope()
 LaunchedEffect(Unit){
  while(true){
   val r=api.incomingCalls()
   if(incoming==null) incoming=r.value?.firstOrNull()
   delay(2500)
  }
 }
 Box(Modifier.fillMaxSize()){
  Scaffold(topBar={CenterAlignedTopAppBar(title={Text("TingTring",fontWeight=FontWeight.Bold)})},bottomBar={NavigationBar{
   NavigationBarItem(selected==0,{selected=0},{Icon(Icons.Default.Home,null)},label={Text("Home")})
   NavigationBarItem(selected==1,{selected=1},{Icon(Icons.Default.People,null)},label={Text("Contacts")})
   NavigationBarItem(selected==2,{selected=2},{Icon(Icons.Default.Person,null)},label={Text("Profile")})
   if(user.plan=="OWNER") NavigationBarItem(selected==3,{selected=3},{Icon(Icons.Default.Settings,null)},label={Text("Owner")})
  }}){p->when(selected){
   0->Home(user,Modifier.padding(p))
   1->Contacts(api,onStartCall,user.plan != "OWNER",Modifier.padding(p))
   2->Profile(api,user,onLogout,Modifier.padding(p))
   3->if(user.plan=="OWNER") OwnerConsole(api,Modifier.padding(p)) else Profile(api,user,onLogout,Modifier.padding(p))
  }}
  incoming?.let { call ->
   AlertDialog(
    onDismissRequest={},
    title={Text("Incoming TingTring call")},
    text={Text(call.callerName + if(call.callType=="VIDEO") " is calling by video." else " is calling you.")},
    confirmButton={TextButton(onClick={
     scope.launch{
      val r=api.acceptCall(call.callId)
      api.markNotificationRead(call.notificationId)
      incoming=null
      r.value?.let(onStartCall)
     }
    }){Text("Accept")}},
    dismissButton={TextButton(onClick={
     scope.launch{
      api.declineCall(call.callId)
      api.markNotificationRead(call.notificationId)
      incoming=null
     }
    }){Text("Decline")}}
   )
  }
 }
}
@Composable private fun Home(user:TttUser,modifier:Modifier=Modifier)=Column(modifier.fillMaxSize().padding(22.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
 Text("Good to see you.",style=MaterialTheme.typography.titleMedium);Text(user.displayName,style=MaterialTheme.typography.headlineLarge)
 Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(24.dp),colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.primaryContainer)){Column(Modifier.padding(22.dp)){Text("Your TingTring ID",style=MaterialTheme.typography.titleMedium);Text(user.tttUserId,style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold);Text("@"+user.username)}}
 Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(20.dp)){Column(Modifier.padding(20.dp)){Text("Calling is next",style=MaterialTheme.typography.titleLarge);Text("Your identity, contacts and account are ready for the calling system.")}}
}

@Composable private fun Contacts(api:ApiClient,onStartCall:(CallSession)->Unit,vanyaAnimationEnabled:Boolean,modifier:Modifier=Modifier){
 var query by rememberSaveable{mutableStateOf("")};var results by remember{mutableStateOf<List<TttUser>>(emptyList())};var contacts by remember{mutableStateOf<List<Contact>>(emptyList())};var error by remember{mutableStateOf<String?>(null)};val scope=rememberCoroutineScope()
 LaunchedEffect(Unit){contacts=api.contacts().value?:emptyList()}
 Column(modifier.fillMaxSize().padding(18.dp)){Text("Contacts",style=MaterialTheme.typography.headlineLarge);Spacer(Modifier.height(12.dp));VanyaCorrectionField(query,{query=it},label="Username or TingTring ID",modifier=Modifier.fillMaxWidth(),enabled=vanyaAnimationEnabled)
 Spacer(Modifier.height(8.dp));Button(onClick={scope.launch{val r=api.search(query);results=r.value?:emptyList();error=r.error}},enabled=query.length>=3){Icon(Icons.Default.Search,null);Spacer(Modifier.width(8.dp));Text("Search")}
 error?.let{Text(it,color=MaterialTheme.colorScheme.error,modifier=Modifier.padding(8.dp))}
 LazyColumn(verticalArrangement=Arrangement.spacedBy(8.dp),contentPadding=PaddingValues(vertical=12.dp)){items(results){u->UserRow(u,"Add","Call",{scope.launch{val r=api.addContact(u.tttUserId);error=r.error;if(r.error==null)contacts=api.contacts().value?:contacts}},{scope.launch{val r=api.startCall(u.tttUserId);error=r.error;r.value?.let(onStartCall)}})};if(results.isEmpty())item{Text("Saved contacts",style=MaterialTheme.typography.titleLarge)};items(contacts){c->UserRow(c.user,"Remove","Call",{scope.launch{val r=api.removeContact(c.id);error=r.error;if(r.error==null)contacts=api.contacts().value?:contacts}},{scope.launch{val r=api.startCall(c.user.tttUserId);error=r.error;r.value?.let(onStartCall)}})}}}
}
@Composable private fun UserRow(user:TttUser,action:String,callAction:String,onAction:()->Unit,onCall:()->Unit)=Card(Modifier.fillMaxWidth()){Row(Modifier.fillMaxWidth().padding(14.dp),verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(user.displayName,fontWeight=FontWeight.SemiBold);Text("@"+user.username+" • "+user.tttUserId,style=MaterialTheme.typography.bodySmall)};TextButton(onClick=onCall){Text(callAction)};TextButton(onClick=onAction){Text(action)}}}

@Composable private fun Profile(api:ApiClient,user:TttUser,onLogout:()->Unit,modifier:Modifier=Modifier){
 val scope=rememberCoroutineScope()
 var username by rememberSaveable{mutableStateOf(user.username)}
 var displayName by rememberSaveable{mutableStateOf(user.displayName)}
 var saving by remember{mutableStateOf(false)}
 var message by remember{mutableStateOf<String?>(null)}
 var error by remember{mutableStateOf<String?>(null)}
 Column(modifier.fillMaxSize().padding(22.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Text("Profile",style=MaterialTheme.typography.headlineLarge,fontWeight=FontWeight.Bold)
  Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(24.dp),colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.primaryContainer)){
   Column(Modifier.padding(20.dp)){
    Text("Your TingTring identity",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
    Text(user.tttUserId,style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=6.dp))
    Text("Your 10-digit ID stays yours even if your username changes.",style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha=.78f),modifier=Modifier.padding(top=4.dp))
   }
  }
  VanyaCorrectionField(username,{username=it.lowercase()},"Username",enabled=!saving)
  VanyaCorrectionField(displayName,{displayName=it},"Display name",enabled=!saving)
  message?.let{Text(it,color=MaterialTheme.colorScheme.primary)}
  error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
  Button(
   onClick={
    saving=true;message=null;error=null
    scope.launch{
     val r=api.updateProfile(username,displayName)
     if(r.value!=null)message="Profile updated." else error=r.error
     saving=false
    }
   },
   enabled=!saving && username!=user.username || !saving && displayName!=user.displayName,
   modifier=Modifier.fillMaxWidth().height(52.dp),
   shape=RoundedCornerShape(17.dp)
  ){if(saving)CircularProgressIndicator(Modifier.size(20.dp),color=MaterialTheme.colorScheme.onPrimary)else Text("Save changes",fontWeight=FontWeight.SemiBold)}
  Text("Plan: "+user.plan,style=MaterialTheme.typography.bodyLarge)
  OutlinedButton(onClick={scope.launch{api.logout();onLogout()}},modifier=Modifier.fillMaxWidth()){Text("Sign out")}
 }
}


@Composable private fun CallScreen(api:ApiClient,session:CallSession,onEnded:()->Unit){
 val context=LocalContext.current
 var connected by remember{mutableStateOf(false)}
 var muted by remember{mutableStateOf(false)}
 var error by remember{mutableStateOf<String?>(null)}
 var permissionGranted by remember{mutableStateOf(androidx.core.content.ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)}
 val scope=rememberCoroutineScope()
 val permissionLauncher=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){permissionGranted=it;if(!it)error="Microphone permission is required"}
 val room=remember{LiveKit.create(appContext=context.applicationContext)}
 DisposableEffect(Unit){
  onDispose{runCatching{room.disconnect();room.release()}}
 }
 LaunchedEffect(Unit){
  if(!permissionGranted) permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
 }
 LaunchedEffect(session.callId,permissionGranted){
  if(!permissionGranted)return@LaunchedEffect
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

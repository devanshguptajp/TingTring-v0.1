package com.tingtring.talk

import android.Manifest
import android.Manifest.permission.BLUETOOTH_CONNECT
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.tingtring.talk.data.ApiClient
import com.tingtring.talk.data.CallSession
import com.tingtring.talk.telecom.TttConnectionRegistry
import io.livekit.android.LiveKit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.util.Locale

private const val CALL_CONNECT_TIMEOUT_MS = 30_000L

@Composable
fun VoiceCallScreen(api: ApiClient, session: CallSession, onEnded: () -> Unit) {
    val context = LocalContext.current
    val audioManager = remember(context) { context.getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    val connectivityManager = remember(context) { context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager }
    val room = remember { LiveKit.create(appContext = context.applicationContext) }
    val scope = rememberCoroutineScope()
    var connected by rememberSaveable(session.callId) { mutableStateOf(false) }
    var muted by rememberSaveable(session.callId) { mutableStateOf(false) }
    var cameraEnabled by rememberSaveable(session.callId) { mutableStateOf(false) }
    var cameraPermissionGranted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var ending by rememberSaveable(session.callId) { mutableStateOf(false) }
    var error by rememberSaveable(session.callId) { mutableStateOf<String?>(null) }
    var networkAvailable by remember { mutableStateOf(hasInternet(connectivityManager)) }
    var audioInterrupted by remember { mutableStateOf(false) }
    var elapsedSeconds by rememberSaveable(session.callId) { mutableStateOf(0L) }
    var route by rememberSaveable(session.callId) { mutableStateOf("Earpiece") }
    var availableRoutes by remember { mutableStateOf(listOf("Earpiece", "Speaker")) }
    var permissionGranted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionGranted = granted
        if (!granted) error = "Microphone permission is required to make a call."
    }
    val bluetoothPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        refreshRoutes()
    }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        cameraPermissionGranted = granted
        if (granted) scope.launch {
            val enabled = runCatching { room.localParticipant.setCameraEnabled(true) }.getOrDefault(false)
            cameraEnabled = enabled
            if (!enabled) error = "Camera could not start. Check camera access and try again."
        } else error = "Camera permission is required for video calls."
    }

    fun refreshRoutes() {
        val routes = mutableListOf("Earpiece", "Speaker")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val hasBluetooth = runCatching {
                audioManager.availableCommunicationDevices.any {
                    it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                        it.type == AudioDeviceInfo.TYPE_BLE_HEADSET
                }
            }.getOrDefault(false)
            if (hasBluetooth) routes.add("Bluetooth")
            val hasWired = runCatching {
                audioManager.availableCommunicationDevices.any {
                    it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                        it.type == AudioDeviceInfo.TYPE_USB_HEADSET
                }
            }.getOrDefault(false)
            if (hasWired) routes.add("Wired headset")
        }
        availableRoutes = routes
        if (route !in routes) route = "Earpiece"
    }

    fun applyRoute(selected: String) {
        route = selected
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val desiredType = when (selected) {
                "Speaker" -> AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                "Bluetooth" -> null
                "Wired headset" -> null
                else -> AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
            }
            val target = runCatching {
                audioManager.availableCommunicationDevices.firstOrNull { device ->
                    when (selected) {
                        "Bluetooth" -> device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || device.type == AudioDeviceInfo.TYPE_BLE_HEADSET
                        "Wired headset" -> device.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || device.type == AudioDeviceInfo.TYPE_USB_HEADSET
                        else -> device.type == desiredType
                    }
                }
            }.getOrNull()
            if (target != null) runCatching { audioManager.setCommunicationDevice(target) }
        } else {
            @Suppress("DEPRECATION")
            runCatching { audioManager.isSpeakerphoneOn = selected == "Speaker" }
        }
    }

    DisposableEffect(session.callId) {
        val oldMode = audioManager.mode
        @Suppress("DEPRECATION")
        val oldSpeaker = audioManager.isSpeakerphoneOn
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        refreshRoutes()

        val networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { networkAvailable = true }
            override fun onLost(network: Network) { networkAvailable = hasInternet(connectivityManager) }
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                networkAvailable = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            }
        }
        val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
            audioInterrupted = change == AudioManager.AUDIOFOCUS_LOSS ||
                change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT ||
                change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK
        }
        @Suppress("DEPRECATION")
        runCatching { audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT) }
        val audioCallback = object : android.media.AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) { refreshRoutes() }
            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) { refreshRoutes() }
        }
        runCatching { connectivityManager.registerDefaultNetworkCallback(networkCallback) }
        runCatching { audioManager.registerAudioDeviceCallback(audioCallback, android.os.Handler(context.mainLooper)) }
        onDispose {
            runCatching { connectivityManager.unregisterNetworkCallback(networkCallback) }
            runCatching { audioManager.unregisterAudioDeviceCallback(audioCallback) }
            @Suppress("DEPRECATION")
            runCatching { audioManager.abandonAudioFocus(focusListener) }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) runCatching { audioManager.clearCommunicationDevice() }
            @Suppress("DEPRECATION")
            runCatching { audioManager.isSpeakerphoneOn = oldSpeaker }
            audioManager.mode = oldMode
            scope.launch { runCatching { room.disconnect(); room.release() } }
        }
    }

    LaunchedEffect(Unit) {
        if (!permissionGranted) permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }
    LaunchedEffect(permissionGranted) {
        if (permissionGranted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ContextCompat.checkSelfPermission(context, BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            bluetoothPermissionLauncher.launch(BLUETOOTH_CONNECT)
        }
    }

    LaunchedEffect(session.callId, permissionGranted) {
        if (!permissionGranted) return@LaunchedEffect
        if (!networkAvailable) {
            error = "No internet connection. Reconnect and try again."
            return@LaunchedEffect
        }
        error = null
        try {
            withTimeout(CALL_CONNECT_TIMEOUT_MS) { room.connect(session.livekitUrl, session.token) }
            if (!room.localParticipant.setMicrophoneEnabled(true)) throw IllegalStateException("MICROPHONE_ENABLE_FAILED")
            connected = true
            elapsedSeconds = 0L
            TttConnectionRegistry.setActive(session.callId)
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            runCatching { room.disconnect() }
            connected = false
            error = "Connection timed out. Check your internet and try again."
        } catch (e: CancellationException) {
            throw e
        } catch (t: Throwable) {
            runCatching { room.disconnect() }
            connected = false
            error = friendlyCallError(t)
        }
    }

    LaunchedEffect(connected) {
        while (connected) {
            delay(1000)
            elapsedSeconds += 1
        }
    }

    fun endCall() {
        if (ending) return
        ending = true
        scope.launch {
            runCatching { api.endCall(session.callId) }
            runCatching { room.disconnect() }
            TttConnectionRegistry.disconnect(session.callId)
            onEnded()
        }
    }

    val routeIndex = availableRoutes.indexOf(route).coerceAtLeast(0)
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("TingTring Talk", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(if (connected) "Connected" else if (!networkAvailable) "Network interrupted" else if (error != null) "Call not connected" else "Connecting…",
                style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(8.dp))
            Text(if (connected) formatCallDuration(elapsedSeconds) else if (session.callType == "VIDEO") "Video call session" else "Voice call session",
                style = MaterialTheme.typography.titleMedium)
            if (audioInterrupted) {
                Spacer(Modifier.height(12.dp))
                Text("Audio is temporarily interrupted by another app or system call.", color = MaterialTheme.colorScheme.error)
            }
            if (!networkAvailable) {
                Spacer(Modifier.height(12.dp))
                Text("Internet changed or dropped. TingTring will keep the call session open while the connection recovers.",
                    color = MaterialTheme.colorScheme.error)
            }
            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }
            if (!permissionGranted) {
                Spacer(Modifier.height(16.dp))
                Button(onClick = { permissionLauncher.launch(Manifest.permission.RECORD_AUDIO) }) {
                    Text("Allow microphone")
                }
            } else if (!connected && error != null && networkAvailable) {
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = { error = null; connected = false; scope.launch {
                    try {
                        withTimeout(CALL_CONNECT_TIMEOUT_MS) { room.connect(session.livekitUrl, session.token) }
                        if (!room.localParticipant.setMicrophoneEnabled(true)) throw IllegalStateException("MICROPHONE_ENABLE_FAILED")
                        connected = true
                        error = null
                        TttConnectionRegistry.setActive(session.callId)
                    } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
                        runCatching { room.disconnect() }
                        connected = false
                        error = "Connection timed out. Check your internet and try again."
                    } catch (e: CancellationException) {
                        throw e
                    } catch (t: Throwable) {
                        runCatching { room.disconnect() }
                        connected = false
                        error = friendlyCallError(t)
                    }
                } }) { Text("Retry connection") }
            }
            Spacer(Modifier.height(28.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (session.callType == "VIDEO") {
                    OutlinedButton(enabled = connected && !ending, onClick = {
                        if (!cameraPermissionGranted) cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                        else scope.launch {
                            val next = !cameraEnabled
                            val enabled = runCatching { room.localParticipant.setCameraEnabled(next) }.getOrDefault(false)
                            if (enabled) cameraEnabled = next else error = "Could not change camera state."
                        }
                    }) { Text(if (cameraEnabled) "Camera off" else "Camera on") }
                }
                OutlinedButton(enabled = connected && !ending, onClick = {
                    scope.launch {
                        val nextMuted = !muted
                        if (room.localParticipant.setMicrophoneEnabled(!nextMuted)) muted = nextMuted
                        else error = "Could not change microphone state."
                    }
                }) { Text(if (muted) "Unmute" else "Mute") }
                OutlinedButton(enabled = !ending && availableRoutes.size > 1, onClick = {
                    applyRoute(availableRoutes[(routeIndex + 1) % availableRoutes.size])
                }) { Text("Audio: $route") }
            }
            if (session.callType == "VIDEO") {
                Spacer(Modifier.height(8.dp))
                Text(if (cameraEnabled) "Camera is publishing to the call room" else "Your camera is off until you enable it.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(12.dp))
            Button(
                enabled = !ending,
                onClick = { endCall() },
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(18.dp)
            ) {
                if (ending) CircularProgressIndicator(Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                else Text("End call", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

private fun hasInternet(connectivityManager: ConnectivityManager): Boolean {
    val network = connectivityManager.activeNetwork ?: return false
    val caps = connectivityManager.getNetworkCapabilities(network) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
}

private fun formatCallDuration(totalSeconds: Long): String {
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return if (hours > 0) String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds)
    else String.format(Locale.US, "%02d:%02d", minutes, seconds)
}

private fun friendlyCallError(error: Throwable): String {
    val message = error.message.orEmpty()
    return when {
        message.contains("MICROPHONE", ignoreCase = true) -> "Microphone could not start. Check app permissions."
        message.contains("timeout", ignoreCase = true) -> "Connection timed out. Check your internet and try again."
        message.contains("network", ignoreCase = true) || message.contains("socket", ignoreCase = true) ->
            "Network connection failed. Check your internet and retry."
        else -> "Call connection failed. Please retry."
    }
}

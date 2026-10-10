package com.tingtring.talk.telecom

import android.net.Uri
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import java.util.concurrent.ConcurrentHashMap

object TttConnectionRegistry {
    private val connections = ConcurrentHashMap<String, Connection>()
    private data class IncomingActions(val answer: () -> Unit, val reject: () -> Unit)
    private val incomingActions = ConcurrentHashMap<String, IncomingActions>()

    fun setIncomingActions(callId: String, onAnswer: () -> Unit, onReject: () -> Unit) {
        incomingActions[callId] = IncomingActions(onAnswer, onReject)
    }

    internal fun answerIncoming(callId: String?) {
        if (!callId.isNullOrBlank()) incomingActions.remove(callId)?.answer?.invoke()
    }

    internal fun rejectIncoming(callId: String?) {
        if (!callId.isNullOrBlank()) incomingActions.remove(callId)?.reject?.invoke()
    }

    internal fun register(callId: String?, connection: Connection) {
        if (!callId.isNullOrBlank()) connections[callId] = connection
    }

    internal fun remove(callId: String?, connection: Connection) {
        if (!callId.isNullOrBlank()) connections.remove(callId, connection)
    }

    fun setActive(callId: String) {
        connections[callId]?.setActive()
    }

    fun disconnect(callId: String) {
        connections.remove(callId)?.let { connection ->
            connection.setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            connection.destroy()
        }
    }
}

class TttConnectionService : ConnectionService() {
    override fun onCreateIncomingConnection(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ): Connection = createConnection(request, incoming = true)

    override fun onCreateOutgoingConnection(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ): Connection = createConnection(request, incoming = false)

    override fun onCreateIncomingConnectionFailed(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ) {
        // Telecom rejected the incoming self-managed call; avoid a second system call UI.
    }

    override fun onCreateOutgoingConnectionFailed(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ) {
        // The in-app call screen remains available if Telecom cannot create the call.
    }

    private fun createConnection(request: ConnectionRequest, incoming: Boolean): Connection {
        val callId = request.extras?.getString("ttt_call_id")
        val connection = TttConnection(callId)
        val address = request.address ?: Uri.parse("ttt:unknown")
        connection.setAddress(address, TelecomManager.PRESENTATION_ALLOWED)
        val displayName = request.extras?.getString("display_name")
            ?.takeIf { it.isNotBlank() }
            ?: "TingTring"
        connection.setCallerDisplayName(displayName, TelecomManager.PRESENTATION_ALLOWED)
        if (incoming) connection.setRinging() else connection.setDialing()
        return connection
    }

    private class TttConnection(private val callId: String?) : Connection() {
        init {
            connectionProperties = PROPERTY_SELF_MANAGED
            connectionCapabilities = CAPABILITY_MUTE or CAPABILITY_SUPPORT_HOLD or CAPABILITY_HOLD
            setAudioModeIsVoip(true)
            TttConnectionRegistry.register(callId, this)
        }

        override fun onAnswer() {
            setActive()
            TttConnectionRegistry.answerIncoming(callId)
        }

        override fun onReject() {
            TttConnectionRegistry.rejectIncoming(callId)
            TttConnectionRegistry.remove(callId, this)
            setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
            destroy()
        }

        override fun onDisconnect() {
            TttConnectionRegistry.rejectIncoming(callId)
            TttConnectionRegistry.remove(callId, this)
            setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            destroy()
        }

        override fun onHold() = setOnHold()
        override fun onUnhold() = setActive()
    }
}

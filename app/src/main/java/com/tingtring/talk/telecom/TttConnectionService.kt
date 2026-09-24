package com.tingtring.talk.telecom

import android.net.Uri
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle

class TttConnectionService : ConnectionService() {
    override fun onCreateIncomingConnection(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ): Connection {
        return createConnection(request)
    }

    override fun onCreateOutgoingConnection(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ): Connection {
        return createConnection(request)
    }

    override fun onCreateIncomingConnectionFailed(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ) {
        // Telecom rejected the incoming self-managed call; do not surface a second call UI.
    }

    override fun onCreateOutgoingConnectionFailed(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ) {
        // Telecom rejected the outgoing self-managed call.
    }

    private fun createConnection(request: ConnectionRequest): Connection {
        val connection = TttConnection()
        val address = request.address ?: Uri.parse("ttt:unknown")
        connection.setAddress(address, TelecomLogPrivacy.PRIORITY_NORMAL)
        val displayName = request.extras?.getString("display_name")
            ?.takeIf { it.isNotBlank() }
            ?: "TingTring"
        connection.setCallerDisplayName(displayName, TelecomLogPrivacy.PRIORITY_NORMAL)
        return connection
    }

    private class TttConnection : Connection() {
        init {
            connectionProperties = PROPERTY_SELF_MANAGED
            connectionCapabilities = CAPABILITY_MUTE or CAPABILITY_SUPPORT_HOLD or CAPABILITY_HOLD
            setAudioModeIsVoip(true)
        }

        override fun onAnswer() = setActive()

        override fun onReject() {
            setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
            destroy()
        }

        override fun onDisconnect() {
            setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            destroy()
        }

        override fun onHold() = setOnHold()
        override fun onUnhold() = setActive()
    }
}

private object TelecomLogPrivacy {
    const val PRIORITY_NORMAL = 0
}
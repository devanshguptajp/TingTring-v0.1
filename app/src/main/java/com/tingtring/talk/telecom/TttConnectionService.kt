package com.tingtring.talk.telecom

import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.PhoneAccountHandle

class TttConnectionService : ConnectionService() {
    override fun onCreateIncomingConnection(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ): Connection {
        return TttConnection().apply { setRinging() }
    }

    override fun onCreateOutgoingConnection(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ): Connection {
        return TttConnection().apply { setDialing() }
    }

    private class TttConnection : Connection() {
        init {
            connectionCapabilities = CAPABILITY_MUTE or CAPABILITY_SUPPORT_HOLD
        }
        override fun onAnswer() {
            setActive()
        }
        override fun onReject() {
            setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
            destroy()
        }
        override fun onDisconnect() {
            setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            destroy()
        }
        override fun onHold() { setOnHold() }
        override fun onUnhold() { setActive() }
    }
}

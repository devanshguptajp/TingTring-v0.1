package com.tingtring.talk.telecom

import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle

class TttConnectionService : ConnectionService() {
    override fun onCreateIncomingConnection(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ): Connection = TttConnection()

    override fun onCreateOutgoingConnection(
        phoneAccountHandle: PhoneAccountHandle,
        request: ConnectionRequest
    ): Connection = TttConnection()

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

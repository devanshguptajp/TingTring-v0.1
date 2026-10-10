package com.tingtring.talk.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.delay

private val VanyaWord = Regex("\\bvanya\\b", RegexOption.IGNORE_CASE)
private val LaserRed = Color(0xFFFF243A)
private val AshGrey = Color(0xFF9AA3B2)

/**
 * Shared field used throughout the app. As soon as a complete standalone "vanya"
 * appears, a laser/ash/typewriter overlay runs and the entered text is changed to "vanay".
 */
@Composable
fun VanyaCorrectionField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    keyboardType: KeyboardType = KeyboardType.Text,
    password: Boolean = false
) {
    val transition = rememberInfiniteTransition(label = "vanya-field")
    val pulse by transition.animateFloat(
        initialValue = 0.72f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400),
            repeatMode = RepeatMode.Reverse
        ),
        label = "vanya-pulse"
    )
    var animating by remember { mutableStateOf(false) }
    var animationToken by remember { mutableIntStateOf(0) }
    var pendingText by remember { mutableStateOf<String?>(null) }
    var lastTriggeredText by remember { mutableStateOf<String?>(null) }
    var phase by remember { mutableIntStateOf(0) }
    var typedText by remember { mutableStateOf("") }
    val laserProgress = remember { Animatable(0f) }
    val shape = RoundedCornerShape(18.dp)
    val borderColor = MaterialTheme.colorScheme.primary.copy(alpha = if (enabled) pulse * 0.32f else 0.08f)

    fun finishAnimation() {
        val original = pendingText
        if (original != null) onValueChange(VanyaWord.replace(original) { "vanay" })
        pendingText = null
        animating = false
        phase = 0
        typedText = ""
        lastTriggeredText = null
    }

    LaunchedEffect(animationToken) {
        if (!animating) return@LaunchedEffect
        phase = 0
        typedText = ""
        laserProgress.snapTo(0f)
        laserProgress.animateTo(1f, animationSpec = tween(durationMillis = 2000))
        phase = 1
        delay(650)
        phase = 2
        val message = "vanay…"
        message.forEach { char ->
            typedText += char
            delay(560)
        }
        phase = 3
        // The close button is available immediately; this also closes the popup automatically.
        delay(1400)
        if (animating) finishAnimation()
    }

    Box(
        modifier
            .fillMaxWidth()
            .border(1.dp, borderColor, shape)
            .padding(1.dp)
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = { next ->
                onValueChange(next)
                if (!animating && VanyaWord.containsMatchIn(next) && next != lastTriggeredText) {
                    pendingText = next
                    lastTriggeredText = next
                    animating = true
                    animationToken += 1
                }
            },
            enabled = enabled && !animating,
            label = { Text(label) },
            singleLine = true,
            shape = shape,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None
        )
    }

    if (animating) {
        Dialog(onDismissRequest = { finishAnimation() }) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF10131C)),
                elevation = CardDefaults.cardElevation(defaultElevation = 18.dp)
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 22.dp, vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text(
                        when (phase) {
                            0 -> "TARGET ACQUIRED"
                            1 -> "WORD DISINTEGRATED"
                            else -> "CORRECTION COMPLETE"
                        },
                        color = Color(0xFFFF6B79),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 2.sp
                    )
                    Box(
                        Modifier.fillMaxWidth().height(116.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .background(Color(0xFF1B202D)),
                        contentAlignment = Alignment.Center
                    ) {
                        if (phase <= 1) {
                            Text(
                                "vanya",
                                color = if (phase == 1) AshGrey.copy(alpha = 0.55f) else Color.White,
                                style = MaterialTheme.typography.displaySmall,
                                fontWeight = FontWeight.Black
                            )
                            Canvas(Modifier.fillMaxSize()) {
                                if (phase == 0) {
                                    val x = size.width * laserProgress.value
                                    drawLine(
                                        color = LaserRed.copy(alpha = 0.28f),
                                        start = Offset(x, size.height * 0.18f),
                                        end = Offset(x, size.height * 0.82f),
                                        strokeWidth = 18f,
                                        cap = StrokeCap.Round
                                    )
                                    drawLine(
                                        color = Color(0xFFFFE6E9),
                                        start = Offset(x, size.height * 0.18f),
                                        end = Offset(x, size.height * 0.82f),
                                        strokeWidth = 3f,
                                        cap = StrokeCap.Round
                                    )
                                } else {
                                    for (i in 0 until 26) {
                                        val x = size.width * (((i * 37) % 97) / 100f)
                                        val y = size.height * (((i * 19) % 83) / 100f)
                                        drawCircle(
                                            color = if (i % 3 == 0) LaserRed.copy(alpha = 0.8f) else AshGrey.copy(alpha = 0.72f),
                                            radius = (i % 4 + 1).toFloat() * 1.4f,
                                            center = Offset(x, y)
                                        )
                                    }
                                }
                            }
                        } else {
                            Text(
                                typedText + if (phase == 2) "▏" else "",
                                color = Color(0xFF8FF0C8),
                                style = MaterialTheme.typography.displaySmall,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                    Text(
                        when (phase) {
                            0 -> "A red laser is cutting the word…"
                            1 -> "The letters turn to ash."
                            2 -> "Rewriting the word"
                            else -> "The text field will now use the corrected spelling."
                        },
                        color = Color(0xFFD4D9E5),
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("TTT • WORD CORRECTION", color = Color(0xFF9AA3B2), style = MaterialTheme.typography.labelSmall)
                        if (phase == 3) {
                            Button(onClick = { finishAnimation() }) { Text("×  Close") }
                        } else {
                            Spacer(Modifier.size(1.dp))
                        }
                    }
                }
            }
        }
    }
}

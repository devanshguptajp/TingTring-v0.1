package com.tingtring.talk.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardOptions
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

private enum class VanyaAnimationStage { IDLE, LASER, TYPING, DONE }

private data class VanyaMatch(
    val start: Int,
    val end: Int
)

private fun findVanya(text: String): VanyaMatch? {
    val regex = Regex("(?i)(?<![A-Za-z])vanya(?![A-Za-z])")
    val match = regex.find(text) ?: return null
    return VanyaMatch(match.range.first, match.range.last + 1)
}

private fun correctedText(text: String, match: VanyaMatch): String =
    text.substring(0, match.start) + "vanay" + text.substring(match.end)

/**
 * Fixed, deterministic spelling correction for one specific word.
 * No AI, network call, or external service is used.
 */
@Composable
fun VanyaCorrectionField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    password: Boolean = false
) {
    var stage by remember { mutableStateOf(VanyaAnimationStage.IDLE) }
    var pendingText by remember { mutableStateOf<String?>(null) }
    var pendingMatch by remember { mutableStateOf<VanyaMatch?>(null) }
    var typedCount by remember { mutableIntStateOf(0) }
    var showDialog by remember { mutableStateOf(false) }

    val match = findVanya(value)

    LaunchedEffect(pendingText, pendingMatch) {
        val text = pendingText ?: return@LaunchedEffect
        val target = pendingMatch ?: return@LaunchedEffect

        stage = VanyaAnimationStage.LASER
        delay(2200)

        stage = VanyaAnimationStage.TYPING
        typedCount = 0

        val replacement = "vanay"
        val before = text.substring(0, target.start)
        val after = text.substring(target.end)

        onValueChange(before)
        delay(150)

        // Five visible keystrokes over roughly four seconds.
        for (i in 1..replacement.length) {
            typedCount = i
            onValueChange(before + replacement.take(i) + after)
            delay(800)
        }

        stage = VanyaAnimationStage.DONE
        pendingText = null
        pendingMatch = null
        delay(250)
        showDialog = true
    }

    LaunchedEffect(value, stage) {
        if (stage == VanyaAnimationStage.IDLE) {
            val found = findVanya(value)
            if (found != null && pendingText == null) {
                pendingText = value
                pendingMatch = found
            }
        }
    }

    Box(modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = { newValue ->
                if (stage == VanyaAnimationStage.IDLE) {
                    onValueChange(newValue)
                }
            },
            label = { Text(label) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = keyboardOptions,
            visualTransformation = if (password) {
                androidx.compose.ui.text.input.PasswordVisualTransformation()
            } else {
                androidx.compose.ui.text.input.VisualTransformation.None
            }
        )

        AnimatedVisibility(
            visible = stage == VanyaAnimationStage.LASER || stage == VanyaAnimationStage.TYPING,
            enter = fadeIn(tween(120)),
            exit = fadeOut(tween(120)),
            modifier = Modifier.matchParentSize()
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.Transparent)
            ) {
                if (stage == VanyaAnimationStage.LASER) {
                    LaserCutAnimation()
                } else {
                    CursorTypingAnimation(typedCount)
                }
            }
        }

        if (showDialog) {
            AlertDialog(
                onDismissRequest = { showDialog = false },
                confirmButton = {},
                title = { Text("😂 Important TingTring correction") },
                text = {
                    Text(
                        "vanay is a boy hahahaha 😂\n\n" +
                            "You were NOT hacked. Your cursor is still yours. " +
                            "Only this animation was added to make the correction dramatic. 😎"
                    )
                },
                dismissButton = {
                    IconButton(onClick = { showDialog = false }) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }
            )
        }
    }
}

@Composable
private fun LaserCutAnimation() {
    var progress by remember { mutableFloatStateOf(0f) }

    LaunchedEffect(Unit) {
        progress = 1f
    }

    val beamX by animateFloatAsState(
        targetValue = progress,
        animationSpec = tween(1850, easing = FastOutSlowInEasing),
        label = "laserBeam"
    )

    val ashAlpha by animateFloatAsState(
        targetValue = if (beamX > 0.85f) 0f else 1f,
        animationSpec = tween(500),
        label = "ashFade"
    )

    Box(Modifier.fillMaxSize()) {
        Text(
            "vanya",
            modifier = Modifier
                .align(Alignment.Center)
                .alpha(ashAlpha),
            style = MaterialTheme.typography.titleLarge
        )

        Canvas(Modifier.fillMaxSize()) {
            val y = size.height / 2f
            val x = size.width * (0.12f + 0.76f * beamX)

            drawLine(
                color = Color.Red.copy(alpha = 0.35f),
                start = Offset(x - 110f, y),
                end = Offset(x + 110f, y),
                strokeWidth = 18f
            )
            drawLine(
                color = Color.Red,
                start = Offset(x - 100f, y),
                end = Offset(x + 100f, y),
                strokeWidth = 5f
            )
            drawCircle(Color.White, radius = 7f, center = Offset(x, y))
        }

        // Two halves visually separate and fall away after the cut.
        val fall by animateFloatAsState(
            targetValue = if (beamX > 0.7f) 1f else 0f,
            animationSpec = tween(700),
            label = "wordFall"
        )
        Row(
            Modifier
                .align(Alignment.Center)
                .offset(y = (fall * 70f).dp)
                .alpha(1f - fall)
        ) {
            Text("van", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.width(4.dp))
            Text("ya", style = MaterialTheme.typography.titleLarge)
        }

        if (beamX > 0.82f) {
            AshParticles()
        }
    }
}

@Composable
private fun AshParticles() {
    val particles = remember {
        List(12) { index ->
            index
        }
    }

    particles.forEach { index ->
        val row = index / 4
        val column = index % 4
        val drift = (column - 1.5f) * 18f
        Box(
            Modifier
                .size(5.dp)
                .align(Alignment.Center)
                .offset(
                    x = drift.dp,
                    y = (row * 12 + 24).dp
                )
                .background(Color.DarkGray.copy(alpha = 0.45f), RoundedCornerShape(50))
        )
    }
}

@Composable
private fun CursorTypingAnimation(typedCount: Int) {
    val cursorAlpha by androidx.compose.animation.core.rememberInfiniteTransition(label = "cursor")
        .animateFloat(
            initialValue = 0.25f,
            targetValue = 1f,
            animationSpec = androidx.compose.animation.core.infiniteRepeatable(
                animation = tween(500),
                repeatMode = androidx.compose.animation.core.RepeatMode.Reverse
            ),
            label = "cursorBlink"
        )

    Column(
        Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            "vanay".take(typedCount),
            style = MaterialTheme.typography.titleLarge
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "▌",
            modifier = Modifier.alpha(cursorAlpha),
            color = MaterialTheme.colorScheme.primary
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "⌁",
            modifier = Modifier.scale(1.2f),
            color = MaterialTheme.colorScheme.primary
        )
    }
}

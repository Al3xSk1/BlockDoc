---
description: Repeater direction, output power, and delay settings.
---

# Repeater

A redstone repeater receives power from its back and sends a fresh signal from its front. Use it to extend a dust line or introduce a predictable delay.

| Property | Value |
| :--- | :--- |
| Identifier | `minecraft:repeater` |
| Output when powered | Signal strength 15 |
| Delay settings | 1, 2, 3, or 4 redstone ticks |
| Default delay | 1 redstone tick |
| Example baseline | Java & Bedrock 1.21 |

## Direction and delay

Place the repeater so its front points toward the part of the circuit you want to power. Interact with it to cycle through its four delay settings.

At the normal game rate, one redstone tick lasts 0.1 seconds. A repeater's delay therefore ranges from 0.1 to 0.4 seconds; changing that delay keeps its powered output at strength 15.

!!! tip "Refresh the signal in time"
    Place the repeater where its back still receives a nonzero signal. It cannot restore power from an already unpowered section of dust.

Return to [signal strength](../signal-strength.md) for a simple distance example.

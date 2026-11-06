---
description: Understand redstone power levels, dust attenuation, and repeaters.
---

# Signal strength

Redstone power uses integer levels from **0** (off) to **15** (full strength). A powered lever can supply level 15 to adjacent dust.

## How power fades

Along a simple uninterrupted line, the first powered dust has strength 15. Each following dust reduces the level by one.

| Dust position from the source | Signal strength |
| ---: | ---: |
| 1 | 15 |
| 2 | 14 |
| 3 | 13 |
| 15 | 1 |
| 16 | 0 |

A correctly oriented [repeater](components/repeater.md) can receive a nonzero signal at its back and output a fresh level 15 signal at its front.

!!! note "Signal strength is separate from delay"
    A repeater restores power and introduces a configurable delay. Its delay setting does not change its output strength.

## Edition notes

=== "Java Edition"

    The basic 0-15 dust model applies. More advanced builds may depend on Java-specific behavior such as quasi-connectivity in certain components.

=== "Bedrock Edition"

    The basic 0-15 dust model also applies. Verify piston behavior and update order in Bedrock before copying a Java circuit.

## Quick check

- [ ] Confirm the source is on.
- [ ] Check that the dust line is connected.
- [ ] Count the dust between repeaters.
- [ ] Check repeater direction.
- [ ] Reproduce the setup in the correct edition.

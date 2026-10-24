# Immutable regression samples

`v34-surface.json` contains 384 original global surface/stamp samples for the
signed V34 saved world. It is copied byte-for-byte from the original local V35
measurement, not regenerated from the current code. SHA-256:
`bac7e728bb7730e41233f7eb8de0537959e5aefbe587568c035cf7047862906c`.

The original test accidentally depended on ignored `evidence/v35` data present
only on the development machine. Keeping its reference here makes a clean
checkout exercise the same compatibility test. Do not update this baseline to
make a changed terrain generator pass.

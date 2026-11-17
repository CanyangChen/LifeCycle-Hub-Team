# Argon2 dependency

The Worker artifact embeds the Argon2id implementation from @noble/hashes 2.0.1.
The upstream MIT license is included here. The bundle was generated with
esbuild 0.25.12 using a single entry that exports only argon2id:

    export { argon2id } from "@noble/hashes/argon2.js";

    esbuild entry.mjs --bundle --platform=browser --format=iife --global-name=demoNoble --outfile=vendor/noble-argon2.js --legal-comments=inline

Source: https://github.com/paulmillr/noble-hashes/tree/2.0.1

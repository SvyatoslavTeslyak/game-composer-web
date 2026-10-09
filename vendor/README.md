Supabase browser bundle: @supabase/supabase-js 2.117.1 (MIT), built with esbuild 0.28.2.
Entry: `export { createClient } from '@supabase/supabase-js';`
Build: `esbuild client.js --bundle --format=esm --platform=browser --target=es2022 --minify --outfile=preview/vendor/supabase.js`.
No third-party JavaScript is fetched at page load. Regenerate from the exact versions above.

MP3 encoder: `lame.min.js` from lamejs 1.2.1 (LGPL-3.0, see lame.LICENSE), copied unchanged from
https://registry.npmjs.org/lamejs/-/lamejs-1.2.1.tgz (sha256 d8d099ef788808c15bc9b4a407dd23ae935feb1152e6bb0efdcd24e3e91c2a2d).
sound-compress.js loads it on demand, only when a sound is compressed before it is added.

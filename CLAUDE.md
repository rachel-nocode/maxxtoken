# maxxToken — Project Instructions

## Always run a FRESH instance of the app

When asked to run/relaunch the app (or when launching it yourself to test a
change), ALWAYS guarantee a fresh instance loads the latest code. The app uses
Electron `requestSingleInstanceLock()` (`desktop/main.js`), so a stale instance
already holding the lock makes any new launch exit silently — and your code
changes never appear. This has bitten us multiple times.

Required sequence every time:

```bash
# 1. Kill ALL existing dev instances and wait for them to die
pkill -9 -f "Developer/maxxToken/desktop/node_modules/electron" 2>/dev/null; sleep 2
# 2. Confirm zero remain (must print 0)
ps aux | grep "Developer/maxxToken/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron " | grep -v grep | wc -l
# 3. Launch fresh
cd desktop && nohup ./node_modules/.bin/electron . >/tmp/maxx-electron.log 2>&1 & disown
# 4. Verify exactly 1 instance is running
sleep 5; ps aux | grep "Developer/maxxToken/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron " | grep -v grep | wc -l
```

Never assume a relaunch worked just because the launch command returned — the
single-instance lock means it can no-op. Always verify the running instance is
new (step 4 must show 1, after step 2 showed 0).

Note: the packaged app also exists at `/Applications/MaxxToken.app`. The dev
instance and the installed app each add a menubar icon. Don't confuse them.

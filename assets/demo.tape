# Sheltr Demo
# Run: vhs assets/demo.tape

Output assets/demo.gif

Require node

Set Shell "bash"
Set FontSize 14
Set FontFamily "JetBrains Mono,Fira Code,monospace"
Set Width 800
Set Height 500
Set Theme "Catppuccin Mocha"
Set Padding 15
Set TypingSpeed 50ms
Set WindowBar Colorful

# --- Intro ---
Sleep 500ms
Type "# Sheltr — encrypted .env file storage"
Enter
Sleep 1.5s
Type "cd ~/projects/sheltr-test"
Enter
Sleep 500ms
Type "cat .env"
Enter
Sleep 2s

# --- Setup ---
Type "sheltr setup"
Enter
Sleep 3.5s

# Step 1: Vault name (first-time setup shows onboarding then prompt)
Type "personal"
Sleep 300ms
Enter
Sleep 700ms

# Step 2: Repo URL
Type "git@github.com:Spardutti/sheltr-cli-demo.git"
Sleep 300ms
Enter
Sleep 4.7s

# Step 3: Key method — "Generate a new key" is first option, just Enter
Enter
Sleep 2s

# Setup done — pause to read output
Sleep 3s

# --- Push ---
Type "sheltr push"
Enter
Sleep 2s

# "No project detected. Use folder name?" — Yes (default)
Enter
Sleep 1s

# Multiselect: .env is listed, press Space to select, then Enter
Space
Sleep 500ms
Enter
Sleep 1s

# "Push 1 file(s) to vault?" — Yes (default)
Enter
Sleep 4s

# Pause to read result
Sleep 2s

# --- Status ---
Type "sheltr status"
Enter
Sleep 2s
# Pause to read status output
Sleep 2s

# --- Simulate fresh machine ---
Type "# Simulate a fresh machine..."
Enter
Sleep 1s
Type "rm .env"
Enter
Sleep 500ms
Type "ls -la"
Enter
Sleep 2s

# --- Pull ---
Type "sheltr pull"
Enter
Sleep 2s

# "No project detected. Use folder name?" — Yes
Enter
Sleep 5s

# Multiselect files to restore — Space to select, then wait, then Enter
Space
Sleep 1s
Enter
Sleep 3s

# Show it's back
Type "cat .env"
Enter
Sleep 3s

Type "# Your secrets are safe with sheltr!"
Enter
Sleep 3s

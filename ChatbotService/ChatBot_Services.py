
from chatterbot import ChatBot
from chatterbot.trainers import ListTrainer
from flask import Flask, request, jsonify
from flask_cors import CORS
import re
import logging
import base64
import json
import os
import jwt
from dotenv import load_dotenv

load_dotenv()

# nltk for priority validation
import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import wordnet

nltk.download('wordnet', quiet=True)
nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)
nltk.download('averaged_perceptron_tagger', quiet=True)

# Load JWT secret from environment
JWT_SECRET = os.getenv('JWT_SECRET')
if not JWT_SECRET:
    raise ValueError("JWT_SECRET environment variable is not set")

# wordnet expands these to synonyms
URGENCY_SEED_WORDS = ['urgent', 'critical', 'emergency', 'broken', 'severe', 'fail']

def build_urgency_vocabulary(seed_words):
    
 
    expanded = set(seed_words)
    for word in seed_words:
        for syn in wordnet.synsets(word):
            for lemma in syn.lemmas():
                expanded.add(lemma.name().replace('_', ' ').lower())
    return expanded

URGENCY_VOCABULARY = build_urgency_vocabulary(URGENCY_SEED_WORDS)

def is_genuine_urgency(message):
   
    
    tokens = word_tokenize(message.lower())
    has_urgency = any(token in URGENCY_VOCABULARY for token in tokens)
    problem_indicators = [
        'not', "can't", 'cannot', 'down', 'fail', 'error',
        'broken', 'issue', 'problem', 'crash', 'help', 'working'
    ]
    has_problem = any(ind in message.lower() for ind in problem_indicators)
    return has_urgency and has_problem

app = Flask(__name__)
CORS(app)

# Initialize ChatBot with SQL storage adapter
chatbot = ChatBot(
    'IT Support Bot',
    storage_adapter='chatterbot.storage.SQLStorageAdapter',
    database_uri='sqlite:///database.sqlite3',
    logic_adapters=[
        {
            'import_path': 'chatterbot.logic.BestMatch',
            'default_response': 'I understand you need help. Could you describe your issue in more detail, or type "create ticket" for immediate support?',
            'maximum_similarity_threshold': 0.70
        }
    ]
)


# category keyword detection

CATEGORY_KEYWORDS = {
    'Network': [
        'wifi', 'wi-fi', 'internet', 'network', 'connection', 'online', 
        'router', 'modem', 'ethernet', 'lan', 'wireless', 'connectivity',
        'dns', 'ip address', 'vpn', 'firewall', 'proxy', 'bandwidth',
        'disconnected', 'no signal', 'network issue', 'wifi not working',
        'internet not working', 'can\'t connect', 'connection issue'
    ],
    'Software': [
        'software', 'app', 'application', 'program', 'install', 'uninstall',
        'crash', 'crashed', 'crashing', 'error', 'bug', 'update', 'upgrade',
        'freezing', 'frozen', 'slow', 'not responding', 'won\'t open',
        'software issue', 'software problem', 'app crash', 'program error',
        'installation', 'reinstall', 'software not working', 'application error',
        'blue screen', 'bsod', 'virus', 'malware', 'antivirus','payment', 'transaction', 'system failure', 'payment failure'
    ],
    'Hardware': [
            'hardware', 'hardware',
        'fan', 'fans', 'fan noise', 'loud fan',
        'overheating', 'hot', 'temperature',
        'heating', 'cooling',
        'cpu hot', 'gpu hot',
        'laptop hot',
        'printer', 'print', 'printing', 'paper', 'ink', 'toner',
        'monitor', 'display', 'keyboard', 'mouse', 'webcam',
        'microphone', 'speaker', 'headphone', 'usb', 'port', 'cable',
        'charger', 'battery', 'power', 'broken', 'damaged', 'not turning on',
        'hardware issue', 'hardware problem', 'device', 'peripheral'
    ],
    'Password': [
        'password', 'login', 'log in', 'signin', 'sign in', 'forgot',
        'reset', 'locked', 'locked out', 'account', 'credentials',
        'authentication', 'username', 'can\'t login', 'password reset',
        'forgot password', 'change password', 'unlock', '2fa', 'mfa'
    ],
    'Email': [
        'email',  'mail', 'outlook', 'gmail', 'inbox',
        'send', 'receive', 'attachment', 'spam', 'junk', 'calendar',
        'meeting', 'invite', 'email issue', 'email problem', 'can\'t send email'
    ]
}

CATEGORY_RESPONSES = {
    'Network': """**Network Troubleshooting Steps:**

1. **Restart your router/modem** - Unplug for 30 seconds, then plug back in
2. **Check WiFi is enabled** on your device (look for airplane mode)
3. **Forget and reconnect** to the network
4. **Move closer to the router** if signal is weak
5. **Check if others are affected** - might be an outage
6. **Try a different device** to isolate the issue

Type 'create ticket' if you need further network support.""",

    'Software': """**Software Troubleshooting Steps:**

1. **Close and reopen** the application
2. **Restart your computer** - this fixes many issues
3. **Check for updates** - outdated software can cause problems
4. **Clear cache/temporary files** of the application
5. **Reinstall the software** if issues persist
6. **Check system requirements** - ensure compatibility

Type 'create ticket' if you need technical support.""",

    'Hardware': """**Hardware Troubleshooting Steps:**

1. **Check all connections** - cables, ports, power
2. **Restart the device** - power cycle completely
3. **Try a different port** (USB devices)
4. **Check for physical damage** - look for visible issues
5. **Update device drivers** if applicable
6. **Test on another computer** to isolate the problem

Type 'create ticket' if you need hardware support.""",

    'Password': """**Password Reset Steps:**

1. **Go to the login page** of the application/website
2. **Click 'Forgot Password'** or 'Reset Password'
3. **Enter your registered email** address
4. **Check your inbox** (and spam folder) for reset link
5. **Create a strong new password** (8+ chars, mixed case, numbers)
6. **Save password** in a secure password manager

Type 'create ticket' if you can't reset your password.""",

    'Email': """**Email Troubleshooting Steps:**

1. **Check internet connection** - email needs connectivity
2. **Restart your email client** - Outlook
3. **Check email settings** - server, port, credentials
4. **Clear browser cache** if using web mail
5. **Check storage quota** - mailbox might be full
6. **Verify recipient address** if sending fails

Type 'create ticket' if you need email support.""",

    'Other': """**General IT Support:**

I'd be happy to help! Could you please provide more details about:
- What exactly is happening?
- When did the issue start?
- Any error messages you're seeing?

Or type 'create ticket' to get immediate human support."""
}

def detect_category(message):
    message_lower = message.lower()
    print(f"Input message: '{message}'")

    # Check each category's keywords in order and return on first match
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in message_lower:
                print(f"  Matched '{keyword}' for category '{category}'")
                return category

    # If no matches found
    print("  No keyword matches found  returning 'Other'")
    return 'Other'

def detect_priority(message):
    message_lower = message.lower()
    
    # Check for escalation phrases first
    escalation_phrases = [
        'talk to human', 'speak to human', 'human support', 'real person',
        'talk to agent', 'speak to agent', 'live agent', 'live support',
        'talk to someone', 'speak to someone', 'contact support',
        'escalate', 'escalate this', 'need human help', 'human assistance',
        'not helpful', 'bot not helping', 'connect me to support',
        'real support', 'actual person', 'human please', 'agent please'
    ]
    
    # Check for escalation phrases
    for phrase in escalation_phrases:
        if phrase in message_lower:
            return 'High'  # Escalation detected
    
    critical_words = [
        'complete outage', 'entire office', 'entire team', 'all users',
        'system down', 'server down', 'company wide', 'everyone affected',
        'data breach', 'security breach', 'ransomware', 'hacked',
        'nothing works', 'total failure'
    ]
    for word in critical_words:
        if word in message_lower:
            if is_genuine_urgency(message):
                return 'Critical'
    
    # High priority keywords
    high_priority_words = [
        'not turning on', 'wont turn on', "won't turn on", 'no power', 'laptop dead', 'computer dead', 'black screen',
         'urgent', 'emergency', 'asap', 'immediately',
        'crashed', 'not working at all', 'completely broken',
        "can't work", 'blocking', 'deadline', 'important meeting',
        'blue screen', 'bsod', 'locked out', 'cannot log in'
    ]
    
    for word in high_priority_words:
        if word in message_lower:
            if is_genuine_urgency(message):
                return 'High'
            else:
                print(f"Priority downgraded: '{word}' found but no genuine urgency context")
                return 'Medium'   
  
    
    # Medium priority keywords
    medium_priority_words = [
          'not working', 'issue', 'problem', 'error', 'help',
        'slow', 'freezing', 'trouble', 'difficult', 'broken',
        'down', 'failed', 'not responding', 'crashing','failure', 'system failure', 'expired', 'licence expired', 'unusable', 'no signal', 'cannot access application'
    ]
    
    for word in medium_priority_words:
        if word in message_lower:
            return 'Medium'  
    
    # Default to Low
    return 'Low' 

def get_category_response(category):
  
    return CATEGORY_RESPONSES.get(category, CATEGORY_RESPONSES['Other'])


def extract_user_id_from_jwt(auth_header):
    """Extract and verify user_id from JWT token using signature verification.

    Returns the user_id string if token is valid, or None if invalid/expired.
    """
    try:
        if not auth_header or not auth_header.lower().startswith('bearer '):
            return None

        token = auth_header.split(' ', 1)[1].strip()

        # Verify JWT signature with secret key
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])

        # Extract user_id from payload (Node.js stores it as 'user_id')
        return str(payload.get('user_id') or payload.get('id') or payload.get('sub') or '')
    except jwt.ExpiredSignatureError:
        logging.warning("JWT token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logging.warning(f"Invalid JWT token: {e}")
        return None
    except Exception as e:
        logging.warning(f"Error extracting user_id from JWT: {e}")
        return None


# Simple in-memory conversation contexts keyed by session_id
conversation_contexts = {}


# SPECIFIC ISSUE DETECTION  gives direct solutions for common specific problems
# This runs BEFORE the generic category/subcategory flow so users get instant help

SPECIFIC_ISSUES = {
        'command_prompt': {
        'keywords': ['command prompt', 'cmd not opening', 'cmd not working', 'command prompt not opening', 'cmd won\'t open', 'terminal not opening', 'command line', 'open cmd', 'how to open cmd', 'how to open command prompt', 'open command prompt', 'how to use cmd', 'what is command prompt', 'what is cmd'],
        'category': 'Software',
        'response': """**Command Prompt Not Opening  Fix:**

1. **Try Run dialog** - Press Windows + R, type "cmd" and hit Enter
2. **Search for it** - Click Start menu, type "Command Prompt", right-click and choose "Run as administrator"
3. **Use PowerShell instead** - Press Windows + X, select "Windows PowerShell" as an alternative
4. **Check if cmd.exe exists** - Navigate to C:\\Windows\\System32 and look for cmd.exe
5. **Run System File Checker** - Open PowerShell as admin, type: sfc /scannow
6. **Create a shortcut** - Right-click desktop, New > Shortcut, type "cmd.exe"

If none of these work, your system files might be corrupted. Type 'create ticket' for further support."""
    },
    'taskbar_not_working': {
        'keywords': ['taskbar not working', 'taskbar frozen', 'taskbar not responding', 'start menu not working', 'start menu not opening', 'start button not working'],
        'category': 'Software',
        'response': """**Taskbar / Start Menu Not Working - Fix:**

1. **Restart Windows Explorer** - Press Ctrl+Shift+Esc to open Task Manager, find "Windows Explorer", right-click and select "Restart"
2. **Try Ctrl+Alt+Del** - Select Task Manager from the menu if taskbar is completely frozen
3. **Run PowerShell fix** - Press Windows+R, type "powershell", then run: Get-AppXPackage | Foreach {Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\\AppXManifest.xml"}
4. **Check for Windows updates** - Settings > Update & Security > Check for updates
5. **Create new user account** - If issue persists, the user profile may be corrupt

Type 'create ticket' if the issue continues."""
    },
    'usb_not_recognized': {
        'keywords': ['usb not recognized', 'usb not working', 'usb device not recognized', 'usb not detected', 'usb not showing', 'pen drive not showing', 'flash drive not working'],
        'category': 'Hardware',
        'response': """**USB Device Not Recognized - Fix:**

1. **Try a different USB port** - Use a port directly on the PC, not a hub
2. **Restart your computer** - With the USB device unplugged, restart then plug it back in
3. **Check Device Manager** - Right-click Start > Device Manager, look for yellow warning icons under "Universal Serial Bus controllers"
4. **Uninstall and reconnect** - In Device Manager, right-click the unknown device > Uninstall, then replug the USB
5. **Update USB drivers** - Device Manager > Universal Serial Bus controllers > right-click > Update driver
6. **Check Disk Management** - Press Windows+R, type "diskmgmt.msc" to see if the drive appears but needs a drive letter assigned

Type 'create ticket' if your USB device still isn't recognized."""
    },
    'no_sound': {
        'keywords': ['no sound', 'no audio', 'sound not working', 'audio not working', 'speakers not working', 'can\'t hear anything', 'volume not working', 'headphones no sound'],
        'category': 'Hardware',
        'response': """**No Sound / Audio Not Working - Fix:**

1. **Check volume** - Click the speaker icon in taskbar, make sure volume is up and not muted
2. **Check output device** - Right-click speaker icon > Open Sound settings, make sure the correct output device is selected
3. **Run audio troubleshooter** - Settings > System > Sound > Troubleshoot
4. **Restart audio service** - Press Windows+R, type "services.msc", find "Windows Audio", right-click > Restart
5. **Update audio drivers** - Device Manager > Sound, video and game controllers > right-click your audio device > Update driver
6. **Check physical connection** - Make sure headphones/speakers are plugged into the correct port (green port for audio)

Type 'create ticket' if audio still isn't working."""
    },
    'bluetooth_issue': {
        'keywords': ['bluetooth not working', 'bluetooth not connecting', 'bluetooth not pairing', 'bluetooth not showing', 'bluetooth off', 'cant connect bluetooth', 'bluetooth device'],
        'category': 'Hardware',
        'response': """**Bluetooth Not Working - Fix:**

1. **Check Bluetooth is on** - Settings > Bluetooth & devices, toggle Bluetooth ON
2. **Turn off and on again** - Toggle Bluetooth off, wait 10 seconds, toggle back on
3. **Restart Bluetooth service** - Press Windows+R, type "services.msc", find "Bluetooth Support Service", right-click > Restart
4. **Remove and re-pair device** - Settings > Bluetooth, remove the device, then add it again
5. **Update Bluetooth driver** - Device Manager > Bluetooth > right-click adapter > Update driver
6. **Check airplane mode** - Make sure airplane mode is OFF in Settings > Network

Type 'create ticket' if Bluetooth still won't work."""
    },
    'webcam_issue': {
        'keywords': ['webcam not working', 'camera not working', 'webcam not detected', 'camera not showing', 'video not working', 'webcam black', 'camera black screen', 'teams camera', 'zoom camera'],
        'category': 'Hardware',
        'response': """**Webcam / Camera Not Working - Fix:**

1. **Check camera privacy** - Settings > Privacy > Camera, make sure "Allow apps to access your camera" is ON
2. **Check the app permissions** - Scroll down in Camera privacy settings and make sure the specific app (Teams, Zoom etc.) has camera access
3. **Try a different app** - Open the built-in Camera app to test if the webcam works at all
4. **Update camera driver** - Device Manager > Cameras > right-click > Update driver
5. **Check for physical switch** - Some laptops have a physical camera shutter or an F-key to toggle camera
6. **Restart the app** - Close Teams/Zoom completely and reopen it

Type 'create ticket' if your camera still doesn't work."""
    },
    'screen_flickering': {
        'keywords': ['screen flickering', 'screen flashing', 'display flickering', 'monitor flickering', 'screen blinking', 'screen keeps flashing'],
        'category': 'Hardware',
        'response': """**Screen Flickering - Fix:**

1. **Check Task Manager test** - Press Ctrl+Shift+Esc. If Task Manager also flickers, it's a driver issue. If only the background flickers, it's an app issue
2. **Update display driver** - Device Manager > Display adapters > right-click > Update driver
3. **Disable animated wallpaper** - Right-click desktop > Personalize > set a static wallpaper
4. **Change refresh rate** - Settings > Display > Advanced display settings > try a different refresh rate
5. **Boot in Safe Mode** - If flickering stops in Safe Mode, a recently installed app or driver is causing it
6. **Check cable connection**  If external monitor, try a different HDMI/DisplayPort cable

Type 'create ticket' if the flickering continues."""
    },
    'computer_wont_shutdown': {
        'keywords': ['won\'t shut down', 'wont shut down', 'can\'t shut down', 'cant shut down', 'not shutting down', 'shutdown stuck', 'computer won\'t turn off', 'pc won\'t turn off'],
        'category': 'Software',
        'response': """**Computer Won't Shut Down - Fix:**

1. **Force shutdown** - Hold the power button for 10 seconds until the PC turns off
2. **Close all apps first** - Press Ctrl+Alt+Del > Task Manager, end any unresponsive programs, then try shutdown again
3. **Use command line** - Press Windows+R, type "shutdown /s /t 0" and press Enter
4. **Disable fast startup** - Control Panel > Power Options > "Choose what the power buttons do" > uncheck "Turn on fast startup"
5. **Check for Windows updates** - Sometimes a pending update blocks shutdown
6. **Run power troubleshooter** - Settings > Troubleshoot > Power

Type 'create ticket' if the problem keeps happening."""
    },
    'file_explorer_crash': {
        'keywords': ['file explorer not working', 'file explorer crash', 'explorer crashing', 'file explorer not responding', 'windows explorer crash', 'my computer not opening', 'this pc not opening', 'file manager not working'],
        'category': 'Software',
        'response': """**File Explorer Not Working - Fix:**

1. **Restart Explorer** - Press Ctrl+Shift+Esc > find "Windows Explorer" > right-click > Restart
2. **Clear Explorer history** - Open File Explorer Options (search in Start), under General tab click "Clear" next to File Explorer history
3. **Run as separate process** - In File Explorer Options > View tab, check "Launch folder windows in a separate process"
4. **Run system scan** - Open CMD as admin, type: sfc /scannow
5. **Check for corrupt files** - Also run: DISM /Online /Cleanup-Image /RestoreHealth
6. **Disable Quick Access** - File Explorer Options > set "Open File Explorer to" as "This PC" instead of Quick Access

Type 'create ticket' if Explorer keeps crashing."""
    },
    'wifi_slow': {
        'keywords': ['wifi slow', 'internet slow', 'slow wifi', 'slow internet', 'wifi speed', 'internet speed slow', 'buffering', 'pages loading slow', 'download slow'],
        'category': 'Network',
        'response': """**Slow WiFi / Internet - Fix:**

1. **Restart router** - Unplug your router for 30 seconds, plug it back in and wait 2 minutes
2. **Move closer to router** - Walls and distance weaken the signal
3. **Disconnect other devices** - Too many devices on the same network slows everyone down
4. **Switch WiFi band** - If your router supports it, connect to the 5GHz network instead of 2.4GHz for faster speeds
5. **Run speed test** - Go to speedtest.net to check your actual speed
6. **Flush DNS** - Open CMD, type: ipconfig /flushdns
7. **Change DNS server** - Use Google DNS (8.8.8.8) or Cloudflare (1.1.1.1) in your network adapter settings

Type 'create ticket' if your internet is still slow."""
    },
    'outlook_crash': {
        'keywords': ['outlook crashing', 'outlook not opening', 'outlook crash', 'outlook won\'t open', 'outlook keeps closing', 'outlook freezing', 'outlook stuck loading'],
        'category': 'Email',
        'response': """**Outlook Not Opening / Crashing - Fix:**

1. **Open in Safe Mode** - Press Windows+R, type "outlook.exe /safe" and press Enter
2. **Disable add-ins** - In Safe Mode, go to File > Options > Add-ins > Manage COM Add-ins > uncheck all and restart Outlook
3. **Repair Outlook data** - Close Outlook, search for "SCANPST.EXE" in Program Files, run it and repair your .pst or .ost file
4. **Repair Office** - Control Panel > Programs > Microsoft Office > Change > Quick Repair
5. **Create new profile** - Control Panel > Mail > Show Profiles > Add a new profile
6. **Clear Outlook cache** - Navigate to %localappdata%\\Microsoft\\Outlook and delete the .ost file (it will rebuild)

Type 'create ticket' if Outlook still won't work."""
    },
    'teams_issue': {
        'keywords': ['teams not working', 'teams crashing', 'teams not opening', 'microsoft teams', 'teams no audio', 'teams not loading', 'teams call not working'],
        'category': 'Software',
        'response': """**Microsoft Teams Not Working - Fix:**

1. **Clear Teams cache** - Close Teams, press Windows+R, type "%appdata%\\Microsoft\\Teams", delete all files in that folder, restart Teams
2. **Check internet connection** - Teams needs a stable connection, try speedtest.net
3. **Update Teams** - Click your profile picture > Check for updates
4. **Try the web version** - Go to teams.microsoft.com in your browser to test
5. **Reinstall Teams** - Uninstall from Settings > Apps, then download fresh from microsoft.com
6. **Check audio/video settings** - In Teams, go to Settings > Devices and make sure the correct mic/speaker/camera is selected

Type 'create ticket' if Teams still has issues."""
    },
    'vpn_issue': {
        'keywords': ['vpn not connecting', 'vpn not working', 'vpn disconnecting', 'vpn error', 'can\'t connect to vpn', 'vpn keeps dropping'],
        'category': 'Network',
        'response': """**VPN Not Connecting - Fix:**

1. **Restart VPN client** - Close the VPN app completely and reopen it
2. **Check internet first** - Make sure your regular internet works before connecting VPN
3. **Try a different server** - If your VPN has multiple servers, try switching to another one
4. **Restart network adapter** - Settings > Network > Change adapter options > right-click your adapter > Disable, then Enable
5. **Flush DNS** - Open CMD as admin, run: ipconfig /flushdns and then ipconfig /release followed by ipconfig /renew
6. **Check firewall** - Your firewall might be blocking the VPN. Temporarily disable it to test

Type 'create ticket' if you still cannot connect to VPN."""
    },
    'computer_overheating': {
        'keywords': ['overheating', 'computer hot', 'laptop hot', 'fan loud', 'fan noise', 'very hot', 'running hot', 'pc overheating', 'laptop overheating'],
        'category': 'Hardware',
        'response': """**Computer Overheating - Fix:**

1. **Check ventilation** - Make sure air vents are not blocked. Don't use laptop on bed or soft surfaces
2. **Clean the vents** - Use compressed air to blow dust out of the vents
3. **Close heavy programs** - Press Ctrl+Shift+Esc, sort by CPU usage and close programs using too many resources
4. **Check room temperature** - Move to a cooler room or use a desk fan pointed at the laptop
5. **Use a cooling pad** - A laptop cooling pad can help with airflow
6. **Update BIOS and drivers** - Sometimes fan control is improved through updates

If your PC is shutting down from overheating, type 'create ticket' for urgent support."""
    },
    'zoom_issue': {
        'keywords': ['zoom not working', 'zoom crashing', 'zoom no audio', 'zoom no video', 'zoom not connecting', 'zoom black screen', 'zoom not opening'],
        'category': 'Software',
        'response': """**Zoom Not Working - Fix:**

1. **Update Zoom** - Open Zoom, click your profile icon > Check for Updates
2. **Check internet connection** - Zoom needs a stable connection, try restarting your router
3. **Test audio/video** - In Zoom, go to Settings > Audio and Settings > Video to test your devices
4. **Close other video apps** - Only one app can use the camera at a time, close Teams/Skype etc.
5. **Reinstall Zoom** - Uninstall from Settings > Apps, download the latest version from zoom.us
6. **Disable hardware acceleration** - In Zoom Settings > Video, uncheck "Hardware Acceleration"

Type 'create ticket' if Zoom still isn't working."""
    },
    'windows_update_stuck': {
        'keywords': ['windows update stuck', 'update stuck', 'windows update not working', 'update taking too long', 'update won\'t install', 'windows update error', 'update failed'],
        'category': 'Software',
        'response': """**Windows Update Stuck / Failed - Fix:**

1. **Wait it out** - Some updates take 30+ minutes, let it run for at least an hour
2. **Restart and retry** - Restart your PC, go to Settings > Update & Security > Check for updates again
3. **Run Update Troubleshooter** - Settings > Troubleshoot > Additional troubleshooters > Windows Update
4. **Clear update cache** - Open CMD as admin, run: net stop wuauserv, then delete contents of C:\\Windows\\SoftwareDistribution\\Download, then: net start wuauserv
5. **Free up disk space** - Updates need space, run Disk Cleanup or delete unnecessary files
6. **Manual download** - Go to catalog.update.microsoft.com and search for the specific update to install manually

Type 'create ticket' if updates keep failing."""
    },
    'forgot_pin': {
        'keywords': ['forgot pin', 'forgot my pin', 'pin not working', 'windows pin', 'pin reset', 'can\'t enter pin', 'login pin not working'],
        'category': 'Password',
        'response': """**Forgot Windows PIN - Fix:**

1. **Click "I forgot my PIN"** - On the Windows login screen, click this option below the PIN field
2. **Sign in with password** - If you have a Microsoft account password, use that instead (click "Sign-in options" on login screen)
3. **Microsoft account reset** - You'll be asked to verify your identity via email or phone linked to your Microsoft account
4. **Set new PIN** - After verification, you can create a new PIN
5. **Use another admin account** - If available, log into another admin account on the PC to reset your account
6. **Safe Mode** - Restart and boot into Safe Mode, you may be able to sign in with just your password

Type 'create ticket' if you're completely locked out."""
    },
    'excel_not_responding': {
        'keywords': ['excel not responding', 'excel frozen', 'excel crashing', 'excel not opening', 'excel slow', 'spreadsheet not opening', 'excel stuck'],
        'category': 'Software',
        'response': """**Excel Not Responding / Crashing - Fix:**

1. **Open in Safe Mode** - Press Windows+R, type "excel /safe" and press Enter
2. **End task and reopen** - Press Ctrl+Shift+Esc, find Excel, click End Task, then reopen your file
3. **Disable add-ins** - In Safe Mode, go to File > Options > Add-ins > Manage COM Add-ins > uncheck all
4. **Repair the file** - Open Excel > File > Open > Browse to your file > click the arrow next to Open > "Open and Repair"
5. **Check file size** - Very large files (50MB+) cause Excel to freeze. Try breaking the file into smaller parts
6. **Repair Office** - Control Panel > Programs > Microsoft Office > Change > Quick Repair

Type 'create ticket' if Excel keeps crashing."""
    }
}

# GENERAL IT KNOWLEDGE

GENERAL_IT_KNOWLEDGE = {
    'what_is_cmd': {
        'keywords': ['what is command prompt', 'what is cmd', 'what is terminal', 'what is powershell', 'what is command line'],
        'category': 'Software',
        'response': """**What is Command Prompt?**

Command Prompt (CMD) is a built-in Windows tool that lets you run commands by typing text instead of clicking buttons.

**How to open it:**
- Press **Windows + R**, type **cmd**, press Enter
- Or search "Command Prompt" in the Start menu
- For admin access: right-click and choose "Run as administrator"

**Common uses:**
- Check network settings: `ipconfig`
- Ping a website: `ping google.com`
- Check disk: `chkdsk`
- System scan: `sfc /scannow`

**PowerShell** is a more advanced version of CMD with extra features.

Type 'create ticket' if you need further help."""
    },
    'how_to_screenshot': {
        'keywords': ['how to screenshot', 'how to take screenshot', 'take a screenshot', 'screen capture', 'print screen', 'snipping tool', 'how to snip', 'screen shot', 'screenshot on my computer', 'screenshot on computer', 'how to screenshot on', 'take screenshot'],
        'category': 'Software',
        'response': """**How to Take a Screenshot:**

1. **Full screen** - Press **PrtSc** (Print Screen) key, then paste with Ctrl+V in Paint or Word
2. **Active window only** - Press **Alt + PrtSc**
3. **Snipping Tool** - Search "Snipping Tool" in Start menu for custom area capture
4. **Snip & Sketch** - Press **Windows + Shift + S** to select an area (copies to clipboard)
5. **Save directly** - Press **Windows + PrtSc** to save screenshot to Pictures > Screenshots folder

Type 'create ticket' if you need help with screenshots."""
    },
    'how_to_zip': {
        'keywords': ['how to zip', 'how to unzip', 'how to extract', 'zip file', 'compress file', 'extract file', 'how to compress', 'rar file', '7zip', 'winrar'],
        'category': 'Software',
        'response': """**How to Zip/Unzip Files:**

**To create a ZIP file:**
1. Select the files you want to compress
2. Right-click > **Send to** > **Compressed (zipped) folder**
3. Or right-click > **Compress to ZIP file** (Windows 11)

**To extract/unzip:**
1. Right-click the .zip file
2. Select **Extract All...**
3. Choose where to save and click Extract

**For .rar files** you need WinRAR or 7-Zip (free download from 7-zip.org)

Type 'create ticket' if you need help with file compression."""
    },
    'how_to_taskmanager': {
        'keywords': ['how to open task manager', 'task manager', 'how to close program', 'how to end task', 'how to force close', 'force quit', 'program stuck'],
        'category': 'Software',
        'response': """**How to Open Task Manager:**

1. **Keyboard shortcut** - Press **Ctrl + Shift + Esc** (fastest way)
2. **Alternative** - Press **Ctrl + Alt + Del** then click "Task Manager"
3. **Right-click taskbar** - Right-click the taskbar > Task Manager

**To force close a program:**
1. Open Task Manager
2. Find the program under "Processes" tab
3. Click on it, then click **End Task**

**Useful tabs:**
- **Processes** - see what's running and using CPU/RAM
- **Startup** - disable programs that slow down your boot time
- **Performance** - check CPU, memory, disk usage

Type 'create ticket' if you need further assistance."""
    },
    'how_to_check_storage': {
        'keywords': ['how to check storage', 'how to check disk space', 'check space', 'how much storage', 'disk space', 'storage full', 'c drive full', 'free up space'],
        'category': 'Software',
        'response': """**How to Check and Free Up Storage:**

**Check storage:**
1. Open **This PC** (File Explorer)
2. You'll see your drives with storage bars showing used/free space
3. Or go to **Settings > System > Storage**

**Free up space:**
1. **Disk Cleanup** - Search "Disk Cleanup" in Start, select drive, check boxes, click OK
2. **Empty Recycle Bin** - Right-click Recycle Bin > Empty
3. **Delete temp files** - Settings > System > Storage > Temporary files
4. **Uninstall unused apps** - Settings > Apps > sort by size

Type 'create ticket' if you need help managing storage."""
    },
    'how_to_connect_wifi': {
        'keywords': ['how to connect wifi', 'how to connect to wifi', 'how to join wifi', 'connect to network', 'how to connect internet', 'wifi setup', 'join network'],
        'category': 'Network',
        'response': """**How to Connect to WiFi:**

1. Click the **WiFi icon** in the bottom-right taskbar
2. Click **WiFi** button to turn it on (if off)
3. Select your network from the list
4. Click **Connect**
5. Enter the WiFi password and click **Next**
6. Choose whether to allow your PC to be discoverable on the network

**If you don't see any networks:**
- Make sure WiFi is turned on (check airplane mode)
- Restart your router
- Update your network drivers

Type 'create ticket' if you need network assistance."""
    },
    'how_to_change_wallpaper': {
        'keywords': ['how to change wallpaper', 'change background', 'change desktop background', 'wallpaper', 'desktop wallpaper', 'change theme'],
        'category': 'Software',
        'response': """**How to Change Desktop Wallpaper:**

1. **Right-click** on your desktop
2. Select **Personalize**
3. Click **Background**
4. Choose from: Picture, Solid color, or Slideshow
5. Click **Browse** to pick your own image
6. Select **Fill**, **Fit**, **Stretch**, or **Center** for display

You can also change your **Theme** in Personalize for a complete look change.

Type 'create ticket' if you need help with display settings."""
    },
    'how_to_split_screen': {
        'keywords': ['how to split screen', 'split screen', 'two windows side by side', 'snap windows', 'how to multitask', 'side by side windows'],
        'category': 'Software',
        'response': """**How to Split Screen / Snap Windows:**

1. **Drag method** - Drag a window to the left or right edge of the screen until you see a transparent outline, then release
2. **Keyboard shortcut** - Press **Windows + Left Arrow** or **Windows + Right Arrow** to snap to half screen
3. **Pick second window** - Windows will show other open apps to fill the other half

**For 4 windows:** Drag windows to corners for quarter-screen snapping

**Windows 11 Snap Layouts:** Hover over the maximize button to see layout options

Type 'create ticket' if you need further help."""
    }
}


def detect_specific_issue(message):
    
    message_lower = message.lower()

    # Check general IT knowledge FIRST (how-to questions)
    for topic_key, topic_info in GENERAL_IT_KNOWLEDGE.items():
        for keyword in topic_info['keywords']:
            if keyword in message_lower:
                logging.info("General IT knowledge matched: %s (keyword: '%s')", topic_key, keyword)
                return topic_info['category'], topic_info['response']

    # Then check specific issues (problems/errors)
    for issue_key, issue_info in SPECIFIC_ISSUES.items():
        for keyword in issue_info['keywords']:
            if keyword in message_lower:
                logging.info("Specific issue matched: %s (keyword: '%s')", issue_key, keyword)
                return issue_info['category'], issue_info['response']

    return None, None


#Hardware subcategories
HARDWARE_SUBCATEGORIES = {
    'keyboard': {
        'keywords': ['keyboard', 'keys', 'typing', 'spacebar', 'keypad'],
        'response': """**Keyboard Troubleshooting:**

1. **Check USB connection** - unplug and replug
2. **Try different USB port** - front/back ports
3. **Test on another computer** - is it the keyboard or PC?
4. **Check for physical damage** - stuck keys, spills
5. **Update keyboard drivers** - Device Manager - Keyboards
6. **Try wireless keyboard** - check batteries if wireless

Type 'create ticket' if issue persists."""
    },
    
    'laptop': {
    'keywords': ['laptop', 'computer', 'pc', 'desktop', 'not turning on', 
                 'wont turn on', 'black screen', 'no power', 'dead'],
    'response': """**Laptop/Computer Not Turning On  Fix:**

1. **Check power cable** - make sure it's plugged in properly
2. **Hold power button** - press and hold for 10-15 seconds
3. **Remove battery** - if removable, take it out, wait 30 seconds, reinsert
4. **Check the charger** - try a different power outlet
5. **Check for lights** - any LED indicators showing?
6. **Hard reset** - hold power for 30 seconds with charger unplugged

Type 'create ticket' if your laptop still won't turn on."""
}, 
    'mouse': {
        'keywords': ['mouse', 'cursor', 'clicking', 'scroll', 'pointer', 'trackpad'],
        'response': """**Mouse Troubleshooting:**

1. **Check connection** - wireless receiver or cable
2. **Clean the sensor** - dust can block tracking
3. **Try different surface** - use a mousepad
4. **Check batteries** - if wireless
5. **Update mouse drivers** - Device Manager - Mice
6. **Test on another PC** - isolate the issue

Type 'create ticket' for further assistance."""
    },
    'printer': {
        'keywords': ['printer', 'print', 'printing', 'paper', 'ink', 'toner', 'scan'],
        'response': """**Printer Troubleshooting:**

1. **Check power and cables** - ensure printer is on
2. **Check paper tray** - paper loaded correctly?
3. **Clear paper jams** - remove stuck paper carefully
4. **Check ink/toner levels** - might need replacement
5. **Set as default printer** - Windows Settings - Printers
6. **Restart print spooler** - Services - Print Spooler - Restart

Type 'create ticket' if you need printer support."""
    },
    'monitor': {
        'keywords': ['monitor', 'display', 'blank', 'black screen', 'no signal'],
        'response': """**Monitor/Display Troubleshooting:**

1. **Check cable connections** - HDMI/DisplayPort/VGA
2. **Check monitor power** - is it turned on?
3. **Try different input** - switch HDMI ports
4. **Adjust brightness** - might be set to minimum
5. **Test with different cable** - cable might be faulty
6. **Connect to another PC** - test monitor itself

Type 'create ticket' for display support."""
    }
}

def get_hardware_subcategory(message):
  
    message_lower = message.lower()
    for subcat, info in HARDWARE_SUBCATEGORIES.items():
        for keyword in info['keywords']:
            if keyword in message_lower:
                return subcat, info['response']
    return None, None

# Software subcategories
SOFTWARE_SUBCATEGORIES = {
    'browser': {
        'keywords': ['browser', 'chrome', 'firefox', 'safari', 'edge', 'internet explorer', 'webpage', 'website', 'loading', 'page not loading', 'browser crash', 'browser slow'],
        'response': """**Browser Troubleshooting:**

1. **Clear cache and cookies** - Settings - Privacy/Security - Clear Data
2. **Disable browser extensions** - they can cause conflicts
3. **Check internet connection** - restart WiFi/ethernet
4. **Update your browser** - outdated versions have bugs
5. **Try a different browser** - check if issue is browser-specific
6. **Reset browser settings** - might have been changed accidentally

Type 'create ticket' if issue persists."""
    },
    'office': {
        'keywords': ['word', 'excel', 'powerpoint', 'outlook', 'office', 'document', 'spreadsheet', 'presentation', 'email client', 'ms office', 'microsoft office', 'office 365'],
        'response': """**Microsoft Office Troubleshooting:**

1. **Restart the application** - close completely and reopen
2. **Check for updates** - Help - Check for Updates
3. **Repair Office** - Control Panel - Programs - Programs and Features - Microsoft Office - Change - Quick Repair (then Online Repair)
4. **Disable add-ins** - they can cause crashes
5. **Try Safe Mode** - hold CTRL while opening (Office only)
6. **Reinstall Office** - if repairs don't work

Type 'create ticket' for Office support."""
    },
    'antivirus': {
        'keywords': ['virus', 'malware', 'antivirus', 'windows defender', 'scan', 'infected', 'security', 'ransomware', 'spyware', 'trojan', 'threat', 'suspicious'],
        'response': """**Antivirus & Security Troubleshooting:**

1. **Run a full system scan** - Windows Defender or installed antivirus
2. **Quarantine detected threats** - follow antivirus recommendations
3. **Update antivirus definitions** - ensure latest threat data
4. **Check Windows Defender** - Settings - Update & Security - Windows Security
5. **Disable potentially unwanted programs** - Settings - Apps - Startup
6. **Safe Mode scan** - Restart - Settings - Troubleshoot - Startup Settings - Safe Mode

Type 'create ticket' if you need security assistance."""
    },
    'performance': {
        'keywords': ['slow', 'freezing', 'frozen', 'lag', 'performance', 'slow startup', 'disk usage', 'cpu usage', 'memory', 'ram', 'running slow', 'takes time to boot'],
        'response': """**Performance & Slow System Troubleshooting:**

1. **Check Task Manager** - Ctrl+Shift+Esc - see what's using resources
2. **Disable startup programs** - Task Manager - Startup - disable unnecessary
3. **Delete temporary files** - Disk Cleanup or CCleaner
4. **Check disk space** - ensure at least 10% free
5. **Scan for malware** - run antivirus full scan
6. **Update drivers** - Device Manager - right-click device - Update driver

Type 'create ticket' for performance optimization help."""
    },
    'driver': {
        'keywords': ['driver', 'update driver', 'driver issue', 'device driver', 'missing driver', 'driver error', 'driver update', 'gpu', 'graphics card', 'sound card', 'network driver'],
        'response': """**Driver Issues Troubleshooting:**

1. **Identify the device** - which device is having driver issues?
2. **Access Device Manager** - Right-click Start - Device Manager
3. **Look for yellow exclamation marks** - indicates driver problems
4. **Update driver** - Right-click device - Update Driver - Search automatically
5. **Uninstall and reinstall** - Right-click - Uninstall device - Restart PC
6. **Download from manufacturer** - visit device maker's website for latest drivers

Type 'create ticket' for driver installation assistance."""
    },
    'installer': {
        'keywords': ['install', 'uninstall', 'installation', 'setup', 'installation failed', 'can\'t install', 'won\'t install', 'installation error', 'setup failed', 'installation stuck'],
        'response': """**Software Installation Troubleshooting:**

1. **Run as administrator** - Right-click installer - Run as administrator
2. **Disable antivirus temporarily** - it can block installations
3. **Check disk space** - need sufficient free space
4. **Use Control Panel uninstall** - remove old version completely first
5. **Clear temp files** - delete C:\\Windows\\Temp contents
6. **Restart computer** - sometimes required before install

Type 'create ticket' if installation still fails."""
    },
    'update': {
        'keywords': ['update', 'upgrade', 'windows update', 'software update', 'update failed', 'update stuck', 'pending update', 'update error', 'can\'t update', 'update problem'],
        'response': """**Software Update Troubleshooting:**

1. **Check for updates manually** - Settings - Update & Security (Windows)
2. **Free up disk space** - updates need space to install
3. **Restart your computer** - may be needed to complete update
4. **Disable antivirus temporarily** - can interfere with updates
5. **Run Windows Update Troubleshooter** - Settings - Troubleshoot - Windows Update
6. **Manual reinstall** - download latest version from official website

Type 'create ticket' for update assistance."""
    }
}

def get_software_subcategory(message):
    
    message_lower = message.lower()
    for subcat, info in SOFTWARE_SUBCATEGORIES.items():
        for keyword in info['keywords']:
            if keyword in message_lower:
                return subcat, info['response']
    return None, None

#Train the bot with IT support conversations
trainer = ListTrainer(chatbot)

#Network issues training 
trainer.train([
    "wifi not working",
    CATEGORY_RESPONSES['Network'],
    "no internet",
    CATEGORY_RESPONSES['Network'],
    "internet not working",
    CATEGORY_RESPONSES['Network'],
    "wifi issue",
    CATEGORY_RESPONSES['Network'],
    "network problem",
    CATEGORY_RESPONSES['Network'],
    "can't connect to wifi",
    CATEGORY_RESPONSES['Network'],
    "connection issue",
    CATEGORY_RESPONSES['Network'],
    "network issue",
    CATEGORY_RESPONSES['Network'],
])

 #Software issues training
trainer.train([
    "software not working",
    CATEGORY_RESPONSES['Software'],
    "I'm having software issues",
    CATEGORY_RESPONSES['Software'],
    "software issue",
    CATEGORY_RESPONSES['Software'],
    "software problem",
    CATEGORY_RESPONSES['Software'],
    "application crashed",
    CATEGORY_RESPONSES['Software'],
    "app crash",
    CATEGORY_RESPONSES['Software'],
    "program freezing",
    CATEGORY_RESPONSES['Software'],
    "app not working",
    CATEGORY_RESPONSES['Software'],
    "program not responding",
    CATEGORY_RESPONSES['Software'],
    "software crash",
    CATEGORY_RESPONSES['Software'],
])

#Hardware issues training 
trainer.train([
    "hardware problem",
    CATEGORY_RESPONSES['Hardware'],
    "I'm having hardware issues",
    CATEGORY_RESPONSES['Hardware'],
    "hardware issue",
    CATEGORY_RESPONSES['Hardware'],
    "printer not working",
    CATEGORY_RESPONSES['Hardware'],
    "can't print",
    CATEGORY_RESPONSES['Hardware'],
    "computer broken",
    CATEGORY_RESPONSES['Hardware'],
    "screen black",
    CATEGORY_RESPONSES['Hardware'],
    "keyboard not working",
    CATEGORY_RESPONSES['Hardware'],
    "mouse not working",
    CATEGORY_RESPONSES['Hardware'],
    "device not working",
    CATEGORY_RESPONSES['Hardware'],
])

#Password issues training
trainer.train([
    "I forgot my password",
    CATEGORY_RESPONSES['Password'],
    "forgot password",
    CATEGORY_RESPONSES['Password'],
    "password not working",
    CATEGORY_RESPONSES['Password'],
    "can't login",
    CATEGORY_RESPONSES['Password'],
    "locked out",
    CATEGORY_RESPONSES['Password'],
    "reset password",
    CATEGORY_RESPONSES['Password'],
    "password reset",
    CATEGORY_RESPONSES['Password'],
    "login issue",
    CATEGORY_RESPONSES['Password'],
])

#Email issues training 
trainer.train([
    "email not working",
    CATEGORY_RESPONSES['Email'],
    "email issue",
    CATEGORY_RESPONSES['Email'],
    "can't send email",
    CATEGORY_RESPONSES['Email'],
    "outlook problems",
    CATEGORY_RESPONSES['Email'],
    "email problem",
    CATEGORY_RESPONSES['Email'],
])

#Greetings
trainer.train([
    "hello",
    "Hello! I'm your IT Support Assistant. How can I help you today? You can describe your issue or choose from: Network, Software, Hardware, Password, or Email problems.",
    "hi",
    "Hi there! What technical issue are you experiencing? I can help with Network, Software, Hardware, Password, and Email issues.",
    "hey",
    "Hey! Tell me about your problem and I'll provide troubleshooting steps.",
    "good morning",
    "Good morning! What can I help you with today?",
    "hi there",
    "Hi! I'm here to help with your IT issues. What's the problem?"
])

# Ticket creation
trainer.train([
    "create ticket",
    "I will create a support ticket for you right away.",
    "escalate",
    "I will escalate this to our support team and create a ticket.",
    "need help",
    "I am  here to help! What issue are you experiencing?",
    "open ticket",
    "I will open a support ticket for you right now.",
    "make ticket",
    "Creating a support ticket for you immediately."
])

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.json or {}
        user_message = data.get('message', '')

        #session context
        #gets the same conversation context regardless of token rotation.
        auth_header = request.headers.get('Authorization', '')
        user_id = extract_user_id_from_jwt(auth_header)
        session_id = data.get('session_id') or user_id or 'default'
        if session_id not in conversation_contexts:
            conversation_contexts[session_id] = {}
        context = conversation_contexts[session_id]

        #category
        category = detect_category(user_message)
        print(f"Detected category: {category}")

        #priority
        priority = detect_priority(user_message)
        
        try:
            priority = str(priority).strip().title()
        except Exception:
            priority = 'Medium'
        if priority not in ['Low', 'Medium', 'High', 'Critical']:
            priority = 'Medium'
        print(f"Detected priority: {priority}")

        bot_response = None

        # Intercept ticket creation commands BEFORE any subcategory state machine
        # so that "create ticket" is never swallowed by a waiting_for branch
        ticket_phrases = ['create ticket', 'escalate', 'open ticket', 'open a ticket', 'make ticket']
        if any(phrase in user_message.lower() for phrase in ticket_phrases):
            return jsonify({
                'reply': 'I will create a support ticket for you right away.',
                'should_create_ticket': True,
                'category': context.get('category', category),
                'priority': priority,
                'is_escalated': False
            })

        #SPECIFIC ISSUE DETECTION runs first

        specific_category, specific_response = detect_specific_issue(user_message)
        if specific_response:
            bot_response = specific_response
            if specific_category:
                category = specific_category
            # Reset any pending subcategory prompts since we gave a direct answer
            context['waiting_for'] = None

        #HARDWARE  
       
        if not bot_response and context.get('waiting_for') == 'hardware_type':
            subcat, subcat_response = get_hardware_subcategory(user_message)
            if subcat:
                context['hardware_subcategory'] = subcat
                context['waiting_for'] = None
                bot_response = subcat_response
            else:
                bot_response = "Which device specifically keyboard, mouse, printer or monitor?"
                return jsonify({'reply': bot_response, 'should_create_ticket': False, 'category': 'Hardware', 'priority': priority})

      
        if not bot_response and category == 'Hardware' and not context.get('hardware_subcategory') and context.get('waiting_for') != 'hardware_type':
            subcat, subcat_response = get_hardware_subcategory(user_message)
            if subcat:
                context['hardware_subcategory'] = subcat
                bot_response = subcat_response
            else:
                context['waiting_for'] = 'hardware_type'
                context['category'] = 'Hardware'
                bot_response = "I can help with hardware. Which device are you having issues with keyboard, mouse, printer, or monitor?"
                return jsonify({'reply': bot_response, 'should_create_ticket': False, 'category': 'Hardware', 'priority': priority})

        #SOFTWARE 
    
        if not bot_response and context.get('waiting_for') == 'software_type':
            subcat, subcat_response = get_software_subcategory(user_message)
            if subcat:
                context['software_subcategory'] = subcat
                context['waiting_for'] = None
                bot_response = subcat_response
            else:
                bot_response = "Can you tell me more? Are you having issues with: Browser, Office, Antivirus, Performance, Drivers, Installation, or Updates?"
                return jsonify({'reply': bot_response, 'should_create_ticket': False, 'category': 'Software', 'priority': priority})

      
        if not bot_response and category == 'Software' and not context.get('software_subcategory') and context.get('waiting_for') != 'software_type':
            subcat, subcat_response = get_software_subcategory(user_message)
            if subcat:
                context['software_subcategory'] = subcat
                bot_response = subcat_response
            else:
                context['waiting_for'] = 'software_type'
                context['category'] = 'Software'
                bot_response = "I can help with software issues. Which area Browser, Office, Antivirus, Performance, Drivers, Installation, or Updates?"
                return jsonify({'reply': bot_response, 'should_create_ticket': False, 'category': 'Software', 'priority': priority})

        #default 
        if not bot_response:
            if category != 'Other':
                bot_response = get_category_response(category)
            else:
                bot_response = str(chatbot.get_response(user_message))

        #ticket creation commands
        should_create_ticket = False
        ticket_phrases = ['create ticket', 'escalate', 'open ticket', 'open a ticket', 'make ticket']
        for phrase in ticket_phrases:
            if phrase in user_message.lower():
                should_create_ticket = True
                break

    
        is_escalation = (priority == 'High' and any(phrase in user_message.lower() for phrase in ['talk to human', 'speak to human', 'human support']))
        if is_escalation:
            bot_response = 'I understand you want to speak with a human support agent.'
            should_create_ticket = True

        ticket_id = None
        ticket_error = None

        
        if should_create_ticket:
            try:
                import requests
                import base64, json

                #Build title from message or session context
                title_source = user_message
                #Prefer previous conversation if provided in request support client may send 'context' field
                if data.get('context'):
                    title_source = data.get('context')

                title = (title_source.strip()[:60] + '...') if len(title_source.strip()) > 60 else title_source.strip()
                description = user_message

                # Extract and verify token with JWT signature validation
                token = None
                if auth_header and auth_header.lower().startswith('bearer '):
                    token = auth_header.split(' ', 1)[1].strip()

                created_by = None
                if token:
                    try:
                        # Verify JWT signature with secret key (matches Node.js backend)
                        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
                        created_by = payload.get('user_id') or payload.get('user') or payload.get('id')
                    except jwt.ExpiredSignatureError:
                        logging.warning('JWT token has expired, cannot extract user_id')
                    except jwt.InvalidTokenError as e:
                        logging.warning(f'JWT verification failed: {e}')

                # Send POST to backend tickets API
                headers = {'Content-Type': 'application/json'}
                if auth_header:
                    headers['Authorization'] = auth_header

                body = {
                    'title': title,
                    'description': description,
                    'category': category,
                    'priority': priority
                }
                # Include created_by if we could decode it backend also derives it from token
                if created_by:
                    body['created_by'] = created_by

                resp = requests.post('http://localhost:5000/tickets', headers=headers, json=body, timeout=8)
                if resp.status_code >= 200 and resp.status_code < 300:
                    try:
                        json_resp = resp.json()
                        # backend returns ticket_id or ticket_id under different keys
                        ticket_id = json_resp.get('ticket_id') or json_resp.get('ticketId') or json_resp.get('ticket')
                        # If backend returns nested info in chatbot-created flow, also check message
                        if not ticket_id and isinstance(json_resp.get('message'), str):
                            # try to parse ticket id from message
                            m = re.search(r"#([A-Z0-9]{6,})", json_resp.get('message'))
                            if m:
                                ticket_id = m.group(1)
                    except Exception:
                        ticket_id = None
                else:
                    ticket_error = f"Backend returned {resp.status_code}: {resp.text}"
            except Exception as e:
                ticket_error = str(e)

        
        response_data = {
            'reply': bot_response,
            'should_create_ticket': should_create_ticket,
            'category': category,
            'priority': priority,
            'is_escalated': is_escalation,
            'ticketCreated': bool(ticket_id),
            'ticketId': ticket_id,
            'ticketError': ticket_error
        }

        return jsonify(response_data)

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    print("ChatterBot IT Support Service starting up")
    print("Listening on http://localhost:5005")
    print("Training complete  Bot is ready!")
    print("Categories: Network, Software, Hardware, Password, Email")
    app.run(host='0.0.0.0', port=5005, debug=False)

# Desktop Release Regression Checklist

This checklist tracks manual desktop regression checks required by the CI regression matrix contract.

- Tray icon appears in the macOS menu bar after app launch (visual)
- Left-clicking the tray icon opens the companion window (visual)
- Right-clicking the tray icon shows the tray context menu (visual)
- Tray icon persists after main window is closed (visual)
- Tray icon is removed when the app quits (visual)
- Main window has native vibrancy effect (frosted glass) on macOS (visual)
- Window can be dragged by clicking the header region (visual)
- Window retains vibrancy when resized (visual)
- Photo quality is acceptable at default settings (hardware)
- Requesting accessibility opens System Preferences (OS interaction)
- Permission status reflects actual system state (OS interaction)
- Context menu appears at cursor position (visual)
- Context menu closes when clicking elsewhere (visual)
- Power state reflects actual battery status (hardware)

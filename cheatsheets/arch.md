______________________________________________________________________

## title: "Arch Linux" draft: false

## Search for the package that contains a file

```bash
pacman -F whois
```

## Upgrading

```
sudo pacman -Syu # to upgrade everything
yay -Syu # to upgrade AUR packages
for package in $(pacman -Qdtq); do sudo pacman -Rns "$package"; done # to clean up packages that are no longer needed
```

## Unicode fonts

```
sudo pacman -S noto-fonts noto-fonts-cjk noto-fonts-emoji noto-fonts-extra
```

## Connecting to shitty WiFi captive portals

You need to comment out the "Added by Evans" sections of resolved.conf:

```
sudo vim /etc/systemd/resolved.conf
```

Then restart systemd-resolved:

```
sudo systemctl restart systemd-resolved.service
```

Don't forget to undo this when you're off the horrible network.

# Enable DNSSEC and DNS over TLS

https://wiki.archlinux.org/index.php/Systemd-resolved#DNS_over_TLS

1. Start and enable systemd-resolved:
   ```
   sudo systemctl enable systemd-resolved.service
   sudo systemctl start systemd-resolved.service
   ```
1. Provide domain name resolution for software that reads /etc/resolv.conf directly:
   ```
   ln -sf ../run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
   ```
1. Enable experimental DNSSEC, by creating /etc/systemd/resolved.conf.d/dnssec.conf:
   ```
   [Resolve]
   DNSSEC=true
   ```
1. Enable DNS over TLS by creating /etc/systemd/resolved.conf.d/dns_over_tls.conf:
   ```
   [Resolve]
   DNS=9.9.9.9#dns.quad9.net 149.112.112.112#dns.quad9.net 2620:fe::fe#dns.quad9.net 2620:fe::9#dns.quad9.net
   DNSOverTLS=yes
   Domains=~.
   ```

# Don't build debug packages

sudo vim /etc/makepkg.conf
Change `debug` to `!debug`

# Firmware updates

```
sudo fwupdmgr refresh
sudo fwupdmgr get-updates
sudo fwupdmgr update
```

# Turn on your firewall, stupid

```
sudo systemctl enable nftables.service
sudo systemctl start nftables.service
```

# Add TRIM to LUKS

https://wiki.archlinux.org/title/Dm-crypt/Specialties#Discard/TRIM_support_for_solid_state_drives_(SSD)

```
lsblk --discard
# If DISC-GRAN and DISC-MAX have non-zero values, TRIM is supported.

# For a LUKS2 device, TRIM support can be enabled by using the --allow-discards --persistent options when opening it. The allow-discards flag will be written into the LUKS2 header and the option will be automatically used whenever the LUKS2 device is opened.
sudo cryptsetup --allow-discards --persistent refresh root

# Optionally, trim manually:
sudo fstrim -v /

# Trimming happens automatically via the fstrim.timer systemd service, which appears to be enabled by default on Arch.
```

# Handy (speech to text, voice dictation, etc.)

https://handy.computer/docs/linux

yay handy ydotool
gsettings set org.gnome.settings-daemon.plugins.media-keys custom-keybindings "['/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/handy/']"
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/handy/ name 'Handy'
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/handy/ command 'handy --toggle-transcription'
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/handy/ binding '<Control>space'

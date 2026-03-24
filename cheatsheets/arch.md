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

# OpenWRT

[OpenWRT](https://openwrt.org/) is a great open source router operating system. See their website to get it installed. Here are a few post-install steps that I typically do to get it fully functional:

1. Go to http://192.168.1.1 (note: it's http, not https). Or maybe HTTPS works by default now?
1. Log in with no password.
1. Go to System, Administration, Router Password, and set a password.
1. SSH to `root@192.168.1.1` with the new password.
1. Upgrade everything with:
   ```bash
   opkg update && opkg list-upgradable | cut -f 1 -d ' ' | xargs opkg upgrade
   ```
1. Set System, Administration, SSH-Keys, and add ed25519 public key.
1. Configure emoji 2.4GHz and 5GHz wifi with WPA2-PSK security and long password:
   1. Click Network, then Wireless.
   1. Find 5Ghz SSID, click Edit.
   1. Under General Setup, set ESSID Name.
   1. Under Wireless Security, change Encryption to WPA2-PSK, and enter a strong key.
   1. Repeat for 2.4GHz wifi.
   1. Click Save & Apply.
   1. Ensure both wifi networks are Enabled.
1. Add another non-emoji 2.4GHz wifi for non-compliant devices:
   1. Click Network, then Wireless.
   1. Find 2.4Ghz SSID, click Add.
   1. Under General Setup, set ESSID Name.
   1. Select the "lan" network.
   1. Under Wireless Security, change Encryption to WPA2-PSK, and enter a strong key.
   1. Repeat for 2.4GHz wifi.
   1. Click Save & Apply.
   1. Ensure that the wifi networks is Enabled.
1. Configure IPv4 DNS by going to Network, Interfaces, wan, Edit, uncheck "Use DNS servers advertised by peer", and enter custom DNS servers.
1. Configure IPv6 DNS by going to Network, Interfaces, wan6, Edit, uncheck "Use DNS servers advertised by peer", and enter custom DNS servers.
1. Set System, System, Hostname to "routeyronda"
1. Set server's DHCP and DHCPv6 to static.
1. Forward ports on firewall.
1. Reboot the router when done.

More stuff:

1. Set up guest WiFi named openwireless.org with OWE security: https://openwrt.org/docs/guide-user/network/wifi/guestwifi/guest-wlan
1. Set up dual-band guest access as well: https://openwrt.org/docs/guide-user/network/wifi/guestwifi/extras#dual-band
1. Ensure that both guest wireless services are isolating clients: https://openwrt.org/docs/guide-user/network/wifi/guestwifi/extras#isolating_clients
1. Enable IPv6 on guest wireless networks: https://openwrt.org/docs/guide-user/network/wifi/guestwifi/extras#ipv6
1. Install ACME? https://github.com/acmesh-official/acme.sh/wiki/How-to-run-on-OpenWRT
1. Add MAC filter for private networks?
1. Disable router access from guest network?
1. Add static DHCP for server.

## Setup DNS over HTTPS (DoH) with Quad9

https://openwrt.org/docs/guide-user/services/dns/doh_dnsmasq_https-dns-proxy
https://quad9.net/doh-quad9-dns-servers/

## IPv6

https://openwrt.org/docs/guide-user/network/ipv6/start
Set WAN6 to /56 prefix so you can use /64s for guest and LAN interfaces

## Installing more crap

opkg install diffutils # for `diff`
opkg install vim-fuller # for `vim -d`

## Add a UCI firewall rule for IPv6 in /etc/config/firewall

```
uci add firewall rule
uci set firewall.@rule[-1].name='Allow-IPv6-HTTP-HTTPS'
uci set firewall.@rule[-1].src='wan'
uci set firewall.@rule[-1].proto='tcp'
uci set firewall.@rule[-1].dest_ip='2603:8001:5800:8cf::7'
uci set firewall.@rule[-1].dest_port='80 443'
uci set firewall.@rule[-1].target='ACCEPT'
uci commit firewall
/etc/init.d/firewall restart
```

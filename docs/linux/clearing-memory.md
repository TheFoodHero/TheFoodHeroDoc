# Linux / Docker Disk Temizleme Notu

## 1. Disk Durumu Kontrolü

```bash
df -hT
```

Önemli alan:

```text
/dev/root  ext4  19G  19G  0  100% /
```

Eğer `/` yani root disk `%90+` seviyesine geldiyse temizlik yapılmalı.

---

## 2. Diski Neyin Doldurduğunu Bulma

Root altındaki büyük klasörleri bul:

```bash
sudo du -xh --max-depth=1 / 2>/dev/null | sort -h
```

Genelde şu klasörler kontrol edilir:

```bash
sudo du -xh --max-depth=1 /var 2>/dev/null | sort -h
sudo du -xh --max-depth=1 /var/lib 2>/dev/null | sort -h
sudo du -xh --max-depth=1 /var/log 2>/dev/null | sort -h
```

Docker/containerd kontrolü:

```bash
sudo du -xh --max-depth=1 /var/lib/docker 2>/dev/null | sort -h
sudo du -xh --max-depth=1 /var/lib/containerd 2>/dev/null | sort -h
```

Örnek sorunlu çıktı:

```text
838M  /var/lib/docker
13G   /var/lib/containerd
```

Bu durumda diski asıl dolduran kaynak genelde Docker image layer, build cache veya containerd snapshot birikimidir.

---

## 3. Büyük Dosyaları Bulma

```bash
sudo find / -xdev -type f -size +100M -exec ls -lh {} \; 2>/dev/null | sort -k5 -h | tail -50
```

Daha büyük dosyalar için:

```bash
sudo find / -xdev -type f -size +500M -exec ls -lh {} \; 2>/dev/null | sort -k5 -h | tail -50
```

---

## 4. Güvenli Sistem Temizliği

APT cache temizliği:

```bash
sudo apt clean
sudo apt autoclean
sudo apt autoremove -y
```

Journal log temizliği:

```bash
journalctl --disk-usage
sudo journalctl --vacuum-size=100M
```

Eski logları temizle:

```bash
sudo find /var/log -type f \( -name "*.gz" -o -name "*.1" -o -name "*.old" \) -delete
```

Büyük aktif logları sıfırla:

```bash
sudo find /var/log -type f -size +50M -exec truncate -s 0 {} \;
```

Kontrol:

```bash
df -hT
```

---

## 5. Docker Disk Kullanımı Kontrolü

Docker çalışıyorsa:

```bash
docker system df
docker system df -v
```

Çalışan ve durmuş container’lar:

```bash
docker ps
docker ps -a
```

Image listesi:

```bash
docker image ls
```

Volume listesi:

```bash
docker volume ls
```

---

## 6. Docker Temizliği

Güvenli temizlik:

```bash
docker image prune -f
docker builder prune -f
```

Daha etkili temizlik:

```bash
docker system prune -a -f
docker builder prune -a -f
```

Açıklama:

```text
docker system prune -a -f:
- Çalışmayan container’ları siler
- Kullanılmayan image’ları siler
- Kullanılmayan network’leri siler
- Build cache temizler
- Çalışan container’lara dokunmaz
```

Dikkat:

```bash
docker volume prune -f
```

Bu komut dikkatli kullanılmalı. PostgreSQL, MongoDB, Redis, Elasticsearch gibi servislerin verileri volume içinde olabilir.

---

## 7. Docker Daemon Çalışmıyorsa

Hata:

```text
Cannot connect to the Docker daemon at unix:///var/run/docker.sock.
Is the docker daemon running?
```

Servis durumunu kontrol et:

```bash
sudo systemctl status docker --no-pager
sudo systemctl status containerd --no-pager
```

Docker loglarını incele:

```bash
sudo journalctl -u docker -n 150 --no-pager
sudo journalctl -u containerd -n 100 --no-pager
```

Eğer disk tamamen doluysa önce Docker dışı temizlik yapılmalı:

```bash
sudo apt clean
sudo apt autoclean
sudo journalctl --vacuum-size=100M
sudo find /var/log -type f \( -name "*.gz" -o -name "*.1" -o -name "*.old" \) -delete
sudo find /var/log -type f -size +50M -exec truncate -s 0 {} \;
df -hT
```

Sonra Docker tekrar başlatılır:

```bash
sudo systemctl reset-failed docker
sudo systemctl restart containerd
sudo systemctl restart docker
sudo systemctl status docker --no-pager
```

Docker açılırsa:

```bash
docker system prune -a -f
docker builder prune -a -f
```

---

## 8. Docker Container Loglarını Temizleme

Container log boyutlarını gör:

```bash
sudo find /var/lib/docker/containers -name "*-json.log" -exec ls -lh {} \; 2>/dev/null | sort -k5 -h | tail -30
```

Logları sıfırla:

```bash
sudo find /var/lib/docker/containers -name "*-json.log" -exec truncate -s 0 {} \; 2>/dev/null
```

---

## 9. Containerd Şişmesini Kontrol Etme

Containerd ana dizin boyutu:

```bash
sudo du -xh --max-depth=1 /var/lib/containerd | sort -h
```

Örnek sorunlu çıktı:

```text
3.7G  /var/lib/containerd/io.containerd.content.v1.content
9.2G  /var/lib/containerd/io.containerd.snapshotter.v1.overlayfs
```

Anlamı:

```text
io.containerd.content.v1.content:
Docker image/content blob cache

io.containerd.snapshotter.v1.overlayfs:
Container/image layer snapshot alanı
```

Çözüm için önce Docker prune denenmeli:

```bash
docker system prune -a -f
docker builder prune -a -f
```

Ardından:

```bash
sudo systemctl restart containerd
sudo systemctl restart docker
```

Direkt `/var/lib/containerd` silinmemeli. Docker runtime verisi bozulabilir.

---

## 10. Kalıcı Önlem: Docker Log Limiti

Docker loglarının sınırsız büyümesini engellemek için:

```bash
sudo nano /etc/docker/daemon.json
```

İçerik:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "3"
  }
}
```

Docker restart:

```bash
sudo systemctl restart docker
```

Kontrol:

```bash
docker info | grep -A5 "Logging Driver"
```

Bu ayar her container için yaklaşık şu limiti koyar:

```text
20 MB x 3 file = 60 MB
```

---

## 11. Docker Compose İçinde Log Limiti

Ortak logging tanımı:

```yaml
x-logging: &default-logging
  driver: "json-file"
  options:
    max-size: "20m"
    max-file: "3"

services:
  auth-service:
    image: your-auth-image
    logging: *default-logging

  user-service:
    image: your-user-image
    logging: *default-logging

  app-service:
    image: your-app-image
    logging: *default-logging
```

---

## 12. Deploy Sonrası Temizlik

Her deploy sonrası önerilen hafif temizlik:

```bash
docker image prune -f
docker builder prune -f
df -h
docker system df
```

Disk küçükse daha agresif:

```bash
docker system prune -a -f
docker builder prune -a -f
df -h
docker system df
```

Örnek deploy akışı:

```bash
cd /app/tfh_server

docker compose pull auth-service
docker compose up -d --force-recreate auth-service

docker image prune -f
docker builder prune -f

df -h
docker system df
```

---

## 13. Haftalık Otomatik Temizlik

Cron düzenle:

```bash
sudo crontab -e
```

Haftalık güvenli Docker temizliği:

```cron
0 3 * * 0 /usr/bin/docker image prune -a -f --filter "until=72h" >/var/log/docker-prune.log 2>&1
10 3 * * 0 /usr/bin/docker builder prune -a -f --filter "until=72h" >>/var/log/docker-prune.log 2>&1
```

Bu son 72 saat içindeki image/cache’lere dokunmadan eski birikimleri temizler.

---

## 14. Disk Alarm Script’i

Script oluştur:

```bash
sudo nano /usr/local/bin/check-disk.sh
```

İçerik:

```bash
#!/bin/bash

THRESHOLD=85
USAGE=$(df / | awk 'NR==2 {gsub("%","",$5); print $5}')

if [ "$USAGE" -ge "$THRESHOLD" ]; then
  echo "$(date) Disk usage is ${USAGE}% on $(hostname)" >> /var/log/disk-alert.log
  docker system df >> /var/log/disk-alert.log 2>&1
fi
```

Yetki ver:

```bash
sudo chmod +x /usr/local/bin/check-disk.sh
```

Cron’a ekle:

```bash
sudo crontab -e
```

```cron
*/30 * * * * /usr/local/bin/check-disk.sh
```

---

## 15. Önerilen Minimum Disk Boyutu

Docker + microservice + CI/CD kullanan sunucularda 19 GB root disk yetersiz kalabilir.

Öneri:

```text
Minimum: 40 GB
Rahat kullanım: 60-80 GB
Docker-heavy ortam: 100 GB
```

Özellikle aşağıdakiler varsa disk daha hızlı dolar:

```text
Docker image layerları
containerd snapshots
build cache
ELK/Filebeat logları
Node.js servisleri
Prisma generated/build dosyaları
ECR image pull geçmişi
```

---

## 16. Hızlı Müdahale Komut Seti

Disk dolduğunda ilk çalıştırılacak set:

```bash
df -hT

sudo du -xh --max-depth=1 / 2>/dev/null | sort -h
sudo du -xh --max-depth=1 /var 2>/dev/null | sort -h
sudo du -xh --max-depth=1 /var/lib 2>/dev/null | sort -h

sudo apt clean
sudo apt autoclean
sudo journalctl --vacuum-size=100M
sudo find /var/log -type f \( -name "*.gz" -o -name "*.1" -o -name "*.old" \) -delete
sudo find /var/log -type f -size +50M -exec truncate -s 0 {} \;

sudo systemctl reset-failed docker
sudo systemctl restart containerd
sudo systemctl restart docker

docker system prune -a -f
docker builder prune -a -f

df -hT
docker system df
sudo du -xh --max-depth=1 /var/lib/containerd | sort -h
```

---

## 17. Kritik Uyarılar

Aşağıdaki komutları dikkatli kullan:

```bash
docker volume prune -f
```

Veritabanı volume’lerini silebilir.

Aşağıdaki klasörleri direkt silme:

```text
/var/lib/docker
/var/lib/containerd
/var/lib/containerd/io.containerd.snapshotter.v1.overlayfs
```

Direkt silme Docker runtime yapısını bozabilir. Önce `docker prune` ve servis restart denenmeli.

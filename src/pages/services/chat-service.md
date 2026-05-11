# TheFoodHero Chat Service — Teknik Analiz ve Mimari Doküman

## 1. Amaç

Chat servisi, TheFoodHero platformunda diyetisyen, danışan ve işletme/clinic ekibi arasında güvenli mesajlaşma altyapısı sağlar.

Bu servis şu ihtiyaçları karşılar:

- Diyetisyen ↔ danışan mesajlaşması
- Danışanların birbirine mesaj atmasının engellenmesi
- Merchant / clinic / işletme çalışanlarının kendi aralarında mesajlaşabilmesi
- Mesaj geçmişi
- Okundu bilgisi
- Teslim edildi bilgisi
- Gerçek zamanlı mesajlaşma için WebSocket desteği
- Offline kullanıcılar için bildirim event’i üretimi
- İleride dosya, görsel, sesli mesaj, görüntülü görüşme bağlantısı desteği

Temel kural:

> Danışan sadece kendi diyetisyeni / yetkili işletme ekibi ile konuşabilir. Danışanlar birbirleriyle konuşamaz. Merchant/clinic bazlı yetkili kullanıcılar ise kendi aralarında konuşabilir.

---

## 2. Temel Domain Kuralları

### 2.1 Kullanıcı Rolleri

Chat tarafında doğrudan auth-service kullanıcı tablosuna bağımlı olmamak için kullanıcılar replica olarak tutulabilir.

```ts
enum ChatUserRole {
  CLIENT        // danışan
  DIETITIAN     // diyetisyen
  MERCHANT_OWNER
  MERCHANT_STAFF
  ADMIN
}
```

### 2.2 Konuşma Tipleri

```ts
enum ConversationType {
  CLIENT_DIETITIAN       // danışan - diyetisyen
  MERCHANT_INTERNAL      // işletme içi konuşma
  SUPPORT                // ileride destek konuşması için
  SYSTEM                 // sistem mesajları için
}
```

### 2.3 Mesaj Gönderme Kuralları

| Senaryo | İzin |
|---|---|
| Danışan → kendi diyetisyeni | Var |
| Diyetisyen → kendi danışanı | Var |
| Danışan → başka danışan | Yok |
| Danışan → başka diyetisyen | Yok |
| Merchant owner → staff | Var |
| Merchant staff → merchant owner | Var |
| Staff → aynı merchant içindeki staff | Opsiyonel, MVP’de verilebilir |
| Staff → başka merchant kullanıcısı | Yok |
| Admin → herkes | Opsiyonel |

---

## 3. Mimari Yaklaşım

Önerilen servis adı:

```txt
chat-service
```

Port önerisi:

```txt
chat-service:5002
```

Servis sorumlulukları:

- Conversation oluşturma
- Mesaj gönderme
- Mesaj listeleme
- Okundu/teslim edildi bilgisini yönetme
- WebSocket bağlantılarını yönetme
- Yetki kontrolü
- Notify-service için event üretme
- Kullanıcı online/offline bilgisini takip etme

---

## 4. Yüksek Seviye Mimari

```txt
React Web / Mobile
      |
      | HTTP + WebSocket
      v
API Gateway / Nginx
      |
      v
chat-service
      |
      |-- PostgreSQL / RDS
      |-- Redis
      |-- Redis Streams / Event Bus
      |
      | emits
      v
notify-service
```

### 4.1 PostgreSQL

Kalıcı veriler için kullanılır:

- Conversations
- Participants
- Messages
- Receipts
- Attachments
- User replica

### 4.2 Redis

Geçici ve hızlı veriler için kullanılır:

- Online kullanıcı listesi
- Socket connection mapping
- Typing indicator
- Son aktiflik
- Pub/Sub veya Redis Streams

### 4.3 Notify-service Entegrasyonu

Kullanıcı offline ise chat-service notify-service’e event atar.

Örnek event:

```json
{
  "eventName": "chat.message.created",
  "merchantId": "merchant_123",
  "conversationId": "conv_123",
  "messageId": "msg_123",
  "senderId": "user_1",
  "receiverIds": ["user_2"],
  "preview": "Merhaba, diyet planınızı güncelledim."
}
```

---

# 5. Tablo Tasarımı

Aşağıdaki model Prisma/PostgreSQL için düşünülmüştür.

---

## 5.1 ChatUserReplica

Chat servisi, auth-service veya user-service’e her mesajda gitmemeli. Bu yüzden kullanıcıların minimum bilgileri replica olarak tutulabilir.

```prisma
enum ChatUserRole {
  CLIENT
  DIETITIAN
  MERCHANT_OWNER
  MERCHANT_STAFF
  ADMIN
}

model ChatUserReplica {
  id          String       @id
  merchantId String?
  fullName    String?
  avatarUrl   String?
  role        ChatUserRole
  isActive    Boolean      @default(true)

  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  conversations ConversationParticipant[]
  messages      ChatMessage[]

  @@index([merchantId])
  @@index([role])
}
```

### Açıklama

| Alan | Açıklama |
|---|---|
| `id` | user-service/auth-service user id |
| `merchantId` | Kullanıcının bağlı olduğu işletme/clinic |
| `role` | Chat içindeki rol |
| `isActive` | Kullanıcı aktif mi |

---

## 5.2 Conversation

Konuşma ana tablosudur.

```prisma
enum ConversationType {
  CLIENT_DIETITIAN
  MERCHANT_INTERNAL
  SUPPORT
  SYSTEM
}

enum ConversationStatus {
  ACTIVE
  ARCHIVED
  BLOCKED
  CLOSED
}

model Conversation {
  id              String             @id @default(cuid())

  merchantId      String?
  type            ConversationType
  status          ConversationStatus @default(ACTIVE)

  title           String?
  relatedEntityId String?
  relatedEntityType String?

  lastMessageId   String?
  lastMessageAt   DateTime?

  createdById     String
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  participants    ConversationParticipant[]
  messages        ChatMessage[]

  @@index([merchantId, type])
  @@index([lastMessageAt])
  @@index([createdById])
}
```

### Açıklama

| Alan | Açıklama |
|---|---|
| `merchantId` | Konuşmanın bağlı olduğu işletme/clinic |
| `type` | Konuşma tipi |
| `status` | Aktif, kapalı, arşivlenmiş vb. |
| `relatedEntityId` | Diyet planı, randevu, ödeme gibi ilişkili kayıt |
| `relatedEntityType` | `DIET_PLAN`, `APPOINTMENT`, `PAYMENT` gibi |
| `lastMessageAt` | Conversation listesini hızlı sıralamak için |

---

## 5.3 ConversationParticipant

Bir conversation içindeki kullanıcıları temsil eder.

```prisma
enum ParticipantRole {
  CLIENT
  DIETITIAN
  MERCHANT_OWNER
  MERCHANT_STAFF
  ADMIN
}

model ConversationParticipant {
  id              String          @id @default(cuid())

  conversationId  String
  userId          String
  merchantId      String?

  role            ParticipantRole

  joinedAt        DateTime        @default(now())
  leftAt          DateTime?

  isMuted         Boolean         @default(false)
  isArchived      Boolean         @default(false)
  isPinned        Boolean         @default(false)

  lastReadMessageId String?
  lastReadAt        DateTime?

  conversation    Conversation    @relation(fields: [conversationId], references: [id])
  user            ChatUserReplica @relation(fields: [userId], references: [id])

  @@unique([conversationId, userId])
  @@index([userId])
  @@index([merchantId])
  @@index([conversationId])
}
```

### Neden ayrı tablo?

Çünkü bir conversation’da birden fazla katılımcı olabilir.

Örnekler:

```txt
CLIENT_DIETITIAN:
- danışan
- diyetisyen

MERCHANT_INTERNAL:
- merchant owner
- merchant staff 1
- merchant staff 2
```

---

## 5.4 ChatMessage

Mesajların tutulduğu ana tablodur.

```prisma
enum MessageType {
  TEXT
  IMAGE
  FILE
  AUDIO
  VIDEO
  SYSTEM
}

enum MessageStatus {
  CREATED
  SENT
  DELIVERED
  READ
  DELETED
  FAILED
}

model ChatMessage {
  id              String        @id @default(cuid())

  conversationId  String
  senderId        String

  merchantId      String?

  type            MessageType   @default(TEXT)
  status          MessageStatus @default(CREATED)

  content         String?
  metadata        Json?

  replyToMessageId String?

  isDeleted       Boolean       @default(false)
  deletedAt       DateTime?

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  conversation    Conversation  @relation(fields: [conversationId], references: [id])
  sender          ChatUserReplica @relation(fields: [senderId], references: [id])

  attachments     ChatMessageAttachment[]
  receipts        ChatMessageReceipt[]

  @@index([conversationId, createdAt])
  @@index([senderId])
  @@index([merchantId])
  @@index([replyToMessageId])
}
```

### Önemli Not

Mesaj silme işleminde hard delete önermem. Bunun yerine:

```ts
isDeleted = true
content = null
deletedAt = now()
```

Böylece audit ve güvenlik açısından geçmiş korunabilir.

---

## 5.5 ChatMessageReceipt

Mesajın kimlere ulaştığı ve kimler tarafından okunduğu bilgisini tutar.

```prisma
enum ReceiptStatus {
  SENT
  DELIVERED
  READ
}

model ChatMessageReceipt {
  id          String        @id @default(cuid())

  messageId   String
  userId      String

  status      ReceiptStatus

  deliveredAt DateTime?
  readAt      DateTime?

  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  message     ChatMessage   @relation(fields: [messageId], references: [id])

  @@unique([messageId, userId])
  @@index([userId])
  @@index([messageId])
  @@index([status])
}
```

### Neden gerekli?

Conversation bazlı `lastReadMessageId` hızlı listeleme için yeterlidir ama mesaj bazlı okundu/teslim edildi bilgisi gerekiyorsa bu tablo gerekir.

MVP’de bu tablo kullanılabilir ama ilk sürümde sadece `ConversationParticipant.lastReadMessageId` ile de başlanabilir.

---

## 5.6 ChatMessageAttachment

Dosya, görsel, PDF, ses kaydı gibi ekleri temsil eder.

```prisma
enum AttachmentType {
  IMAGE
  FILE
  AUDIO
  VIDEO
}

model ChatMessageAttachment {
  id          String         @id @default(cuid())

  messageId   String
  type        AttachmentType

  fileName    String?
  fileUrl     String
  mimeType    String?
  size        Int?

  createdAt   DateTime       @default(now())

  message     ChatMessage    @relation(fields: [messageId], references: [id])

  @@index([messageId])
  @@index([type])
}
```

### Dosya Nerede Tutulmalı?

Dosyalar PostgreSQL içinde tutulmamalı.

Önerilen yapı:

```txt
S3 / Cloudflare R2 / MinIO
```

DB’de sadece URL ve metadata tutulur.

---

## 5.7 ChatBlockRule

İleride engelleme, kapatma veya iletişimi durdurma için kullanılabilir.

```prisma
model ChatBlockRule {
  id            String   @id @default(cuid())

  merchantId    String?
  blockerUserId String
  blockedUserId String

  reason        String?
  createdAt     DateTime @default(now())

  @@unique([blockerUserId, blockedUserId])
  @@index([merchantId])
}
```

MVP için şart değil ama ileride gerekli olabilir.

---

# 6. MVP İçin Minimum Tablo Seti

İlk sürümde şu tablolar yeterli olur:

```txt
ChatUserReplica
Conversation
ConversationParticipant
ChatMessage
ChatMessageReceipt
```

Attachment desteği MVP sonrası eklenebilir.

---

# 7. Prisma Schema Önerisi — MVP

```prisma
enum ChatUserRole {
  CLIENT
  DIETITIAN
  MERCHANT_OWNER
  MERCHANT_STAFF
  ADMIN
}

enum ConversationType {
  CLIENT_DIETITIAN
  MERCHANT_INTERNAL
  SUPPORT
  SYSTEM
}

enum ConversationStatus {
  ACTIVE
  ARCHIVED
  BLOCKED
  CLOSED
}

enum ParticipantRole {
  CLIENT
  DIETITIAN
  MERCHANT_OWNER
  MERCHANT_STAFF
  ADMIN
}

enum MessageType {
  TEXT
  IMAGE
  FILE
  AUDIO
  VIDEO
  SYSTEM
}

enum MessageStatus {
  CREATED
  SENT
  DELIVERED
  READ
  DELETED
  FAILED
}

enum ReceiptStatus {
  SENT
  DELIVERED
  READ
}

model ChatUserReplica {
  id          String       @id
  merchantId String?
  fullName    String?
  avatarUrl   String?
  role        ChatUserRole
  isActive    Boolean      @default(true)

  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  conversations ConversationParticipant[]
  messages      ChatMessage[]

  @@index([merchantId])
  @@index([role])
}

model Conversation {
  id                String             @id @default(cuid())

  merchantId        String?
  type              ConversationType
  status            ConversationStatus @default(ACTIVE)

  title             String?
  relatedEntityId   String?
  relatedEntityType String?

  lastMessageId     String?
  lastMessageAt     DateTime?

  createdById       String
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  participants      ConversationParticipant[]
  messages          ChatMessage[]

  @@index([merchantId, type])
  @@index([lastMessageAt])
  @@index([createdById])
}

model ConversationParticipant {
  id                String          @id @default(cuid())

  conversationId    String
  userId            String
  merchantId        String?

  role              ParticipantRole

  joinedAt          DateTime        @default(now())
  leftAt            DateTime?

  isMuted           Boolean         @default(false)
  isArchived        Boolean         @default(false)
  isPinned          Boolean         @default(false)

  lastReadMessageId String?
  lastReadAt        DateTime?

  conversation      Conversation    @relation(fields: [conversationId], references: [id])
  user              ChatUserReplica @relation(fields: [userId], references: [id])

  @@unique([conversationId, userId])
  @@index([userId])
  @@index([merchantId])
  @@index([conversationId])
}

model ChatMessage {
  id                String          @id @default(cuid())

  conversationId    String
  senderId          String
  merchantId        String?

  type              MessageType     @default(TEXT)
  status            MessageStatus   @default(CREATED)

  content           String?
  metadata          Json?

  replyToMessageId  String?

  isDeleted         Boolean         @default(false)
  deletedAt         DateTime?

  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  conversation      Conversation    @relation(fields: [conversationId], references: [id])
  sender            ChatUserReplica @relation(fields: [senderId], references: [id])

  receipts          ChatMessageReceipt[]

  @@index([conversationId, createdAt])
  @@index([senderId])
  @@index([merchantId])
  @@index([replyToMessageId])
}

model ChatMessageReceipt {
  id          String        @id @default(cuid())

  messageId   String
  userId      String

  status      ReceiptStatus

  deliveredAt DateTime?
  readAt      DateTime?

  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  message      ChatMessage  @relation(fields: [messageId], references: [id])

  @@unique([messageId, userId])
  @@index([userId])
  @@index([messageId])
  @@index([status])
}
```

---

# 8. Conversation Oluşturma Kuralları

## 8.1 Danışan - Diyetisyen Conversation

Bir danışan ile bir diyetisyen arasında aynı merchant içinde tek aktif conversation olmalı.

Bunun için uygulama seviyesinde şu kontrol yapılmalı:

```ts
conversation.type = CLIENT_DIETITIAN
conversation.merchantId = merchantId

participants:
- clientId
- dietitianId
```

Önerilen unique constraint doğrudan Prisma tarafında zor olabilir çünkü participants ayrı tabloda. Bu yüzden servis seviyesinde kontrol edilir:

```ts
find existing conversation where:
- type = CLIENT_DIETITIAN
- merchantId = merchantId
- participants includes clientId
- participants includes dietitianId
- status = ACTIVE
```

Varsa mevcut conversation döndürülür, yoksa yeni oluşturulur.

---

## 8.2 Merchant Internal Conversation

Merchant içi konuşma için şu kurallar geçerli olabilir:

- Sadece aynı merchant altındaki kullanıcılar eklenebilir.
- Danışan bu konuşmaya eklenemez.
- En az 2 participant olmalı.
- Owner tüm merchant içi konuşmaları görebilir mi? Bu iş kuralına göre karar verilmeli.

Önerim:

```txt
MVP:
- Owner ve staff kendi katıldığı konuşmaları görür.
- Owner tüm konuşmaları admin panelde görebilir, ama normal chat listesinde sadece katıldıklarını görür.
```

---

# 9. Yetki Kontrolü

Chat servisinde en kritik alan burasıdır.

## 9.1 Mesaj Gönderme Kontrolü

Bir kullanıcı mesaj göndermeden önce kontrol:

```ts
1. Conversation var mı?
2. Conversation ACTIVE mi?
3. Sender conversation participant mı?
4. Sender leftAt null mı?
5. Conversation type'a göre rol uygun mu?
6. MerchantId uyuşuyor mu?
7. Block rule var mı?
```

## 9.2 Danışanlar Birbirine Yazmasın

Bu kural iki seviyede korunmalı:

### Conversation oluştururken

```ts
if conversation.type === CLIENT_DIETITIAN:
  participants içinde sadece:
  - 1 CLIENT
  - 1 DIETITIAN
olmalı.
```

### Mesaj gönderirken

```ts
CLIENT kullanıcısı sadece participant olduğu CLIENT_DIETITIAN conversation içine mesaj atabilir.
```

Danışanların kendi arasında conversation oluşturmasına izin verilmez.

---

# 10. API Tasarımı

## 10.1 Conversation Başlatma

```http
POST /chat/conversations/client-dietitian
```

Body:

```json
{
  "clientId": "client_123",
  "dietitianId": "dietitian_456",
  "merchantId": "merchant_789"
}
```

Response:

```json
{
  "id": "conv_123",
  "type": "CLIENT_DIETITIAN",
  "merchantId": "merchant_789"
}
```

---

## 10.2 Merchant İç Konuşma Başlatma

```http
POST /chat/conversations/merchant-internal
```

Body:

```json
{
  "merchantId": "merchant_789",
  "title": "Klinik Ekibi",
  "participantUserIds": [
    "user_1",
    "user_2",
    "user_3"
  ]
}
```

---

## 10.3 Conversation Listesi

```http
GET /chat/conversations
```

Query:

```txt
?limit=20&cursor=xxx
```

Response:

```json
{
  "items": [
    {
      "id": "conv_123",
      "type": "CLIENT_DIETITIAN",
      "title": null,
      "lastMessage": {
        "id": "msg_1",
        "content": "Merhaba hocam",
        "createdAt": "2026-05-11T17:00:00.000Z"
      },
      "unreadCount": 3,
      "participants": [
        {
          "userId": "client_123",
          "fullName": "Ahmet Yılmaz",
          "role": "CLIENT"
        },
        {
          "userId": "dietitian_456",
          "fullName": "Dyt. Ayşe Demir",
          "role": "DIETITIAN"
        }
      ]
    }
  ],
  "nextCursor": "..."
}
```

---

## 10.4 Mesaj Listeleme

```http
GET /chat/conversations/:conversationId/messages
```

Query:

```txt
?limit=30&beforeMessageId=msg_123
```

Response:

```json
{
  "items": [
    {
      "id": "msg_123",
      "senderId": "user_1",
      "content": "Merhaba",
      "type": "TEXT",
      "status": "READ",
      "createdAt": "2026-05-11T17:00:00.000Z"
    }
  ]
}
```

---

## 10.5 Mesaj Gönderme

```http
POST /chat/conversations/:conversationId/messages
```

Body:

```json
{
  "type": "TEXT",
  "content": "Merhaba, diyet planımı kontrol eder misiniz?"
}
```

Response:

```json
{
  "id": "msg_123",
  "conversationId": "conv_123",
  "senderId": "client_123",
  "content": "Merhaba, diyet planımı kontrol eder misiniz?",
  "status": "SENT",
  "createdAt": "2026-05-11T17:00:00.000Z"
}
```

---

## 10.6 Okundu İşaretleme

```http
POST /chat/conversations/:conversationId/read
```

Body:

```json
{
  "lastReadMessageId": "msg_123"
}
```

Bu işlem:

- `ConversationParticipant.lastReadMessageId` günceller
- `ConversationParticipant.lastReadAt` günceller
- Gerekirse `ChatMessageReceipt` kayıtlarını `READ` yapar
- WebSocket ile karşı tarafa read event gönderir

---

# 11. WebSocket Event Tasarımı

Socket path önerisi:

```txt
/chat/socket
```

veya:

```txt
/socket.io/chat
```

## 11.1 Client → Server Events

### Mesaj gönderme

```ts
chat:message:send
```

Payload:

```json
{
  "conversationId": "conv_123",
  "type": "TEXT",
  "content": "Merhaba"
}
```

### Typing Başladı

```ts
chat:typing:start
```

```json
{
  "conversationId": "conv_123"
}
```

### Typing Bitti

```ts
chat:typing:stop
```

```json
{
  "conversationId": "conv_123"
}
```

### Conversation okundu

```ts
chat:conversation:read
```

```json
{
  "conversationId": "conv_123",
  "lastReadMessageId": "msg_123"
}
```

---

## 11.2 Server → Client Events

### Yeni mesaj

```ts
chat:message:new
```

```json
{
  "conversationId": "conv_123",
  "message": {
    "id": "msg_123",
    "senderId": "user_1",
    "content": "Merhaba",
    "createdAt": "2026-05-11T17:00:00.000Z"
  }
}
```

### Mesaj teslim edildi

```ts
chat:message:delivered
```

### Mesaj okundu

```ts
chat:message:read
```

### Typing

```ts
chat:typing
```

```json
{
  "conversationId": "conv_123",
  "userId": "user_1",
  "isTyping": true
}
```

---

# 12. Redis Kullanımı

## 12.1 Online User Mapping

```txt
chat:online:user:{userId} = socketId
```

TTL:

```txt
60 saniye
```

Socket aktif oldukça yenilenir.

## 12.2 User Socket Set

Bir kullanıcı birden fazla cihazdan bağlı olabilir.

```txt
chat:user:sockets:{userId} = Set(socketId1, socketId2)
```

## 12.3 Typing Indicator

```txt
chat:typing:{conversationId}:{userId} = true
```

TTL:

```txt
5 saniye
```

---

# 13. Event-Driven Akış

## 13.1 Message Created Event

Mesaj oluşturulduğunda event üretilir.

```ts
ChatMessageCreatedEvent
```

Payload:

```json
{
  "eventId": "evt_123",
  "eventName": "chat.message.created",
  "merchantId": "merchant_123",
  "conversationId": "conv_123",
  "messageId": "msg_123",
  "senderId": "user_1",
  "receiverIds": ["user_2"],
  "createdAt": "2026-05-11T17:00:00.000Z"
}
```

Bu event notify-service tarafından kullanılabilir.

---

## 13.2 Notify-service Ne Yapmalı?

Notify-service:

- Receiver online mı kontrol edebilir veya chat-service event içinde bunu belirtebilir.
- Offline ise push notification / email / in-app notification oluşturabilir.
- Mesaj içeriği hassas ise sadece preview gönderebilir.

Önerilen notification title:

```txt
Yeni mesajınız var
```

Body:

```txt
Dyt. Ayşe Demir size mesaj gönderdi.
```

---

# 14. Servis Katmanı Tasarımı

## 14.1 Dosya Yapısı

TheFoodHero yapına uygun öneri:

```txt
services/chat-service/
  src/
    controllers/
      conversation.controller.ts
      message.controller.ts
      socket.controller.ts

    useCases/
      conversation/
        createClientDietitianConversation.useCase.ts
        createMerchantInternalConversation.useCase.ts
        getConversationList.useCase.ts
        archiveConversation.useCase.ts

      message/
        sendMessage.useCase.ts
        getMessages.useCase.ts
        markConversationAsRead.useCase.ts
        deleteMessage.useCase.ts

    repositories/
      conversation.repository.ts
      conversationParticipant.repository.ts
      chatMessage.repository.ts
      chatMessageReceipt.repository.ts
      chatUserReplica.repository.ts

    domain/
      enums/
      guards/
        chatPermission.guard.ts
        conversationPolicy.guard.ts

    socket/
      chat.gateway.ts
      socketAuth.middleware.ts
      socketRoom.manager.ts

    events/
      chatMessageCreated.event.ts
      chatEventPublisher.ts

    db/
      prisma/
        schema.prisma
        prismaDBConnector.ts

    routes/
      chat.routes.ts

    app.ts
    server.ts
```

---

# 15. Use Case Akışları

## 15.1 SendMessageUseCase

Pseudo akış:

```ts
class SendMessageUseCase {
  async execute(input) {
    const user = await this.chatUserRepo.getById(input.senderId);

    const conversation = await this.conversationRepo.getById(input.conversationId);

    await this.permissionGuard.ensureCanSendMessage({
      user,
      conversation,
    });

    const participants = await this.participantRepo.getByConversationId(conversation.id);

    const message = await this.messageRepo.create({
      conversationId: conversation.id,
      senderId: user.id,
      merchantId: conversation.merchantId,
      type: input.type,
      content: input.content,
      status: "SENT",
    });

    await this.conversationRepo.updateLastMessage({
      conversationId: conversation.id,
      lastMessageId: message.id,
      lastMessageAt: message.createdAt,
    });

    await this.receiptRepo.createForReceivers({
      messageId: message.id,
      receiverIds: participants
        .filter(x => x.userId !== user.id)
        .map(x => x.userId),
      status: "SENT",
    });

    await this.socketGateway.emitMessageToConversation(conversation.id, message);

    await this.eventPublisher.publishMessageCreated({
      conversation,
      message,
      receiverIds,
    });

    return message;
  }
}
```

---

# 16. Permission Guard Mantığı

```ts
class ChatPermissionGuard {
  ensureCanSendMessage(user, conversation, participants) {
    if (conversation.status !== "ACTIVE") {
      throw new Error("Conversation aktif değil.");
    }

    const participant = participants.find(x => x.userId === user.id);

    if (!participant) {
      throw new Error("Bu konuşmaya erişim yetkiniz yok.");
    }

    if (participant.leftAt) {
      throw new Error("Bu konuşmadan ayrılmışsınız.");
    }

    if (conversation.type === "CLIENT_DIETITIAN") {
      this.ensureClientDietitianRules(participants);
    }

    if (conversation.type === "MERCHANT_INTERNAL") {
      this.ensureMerchantInternalRules(user, conversation, participants);
    }
  }

  ensureClientDietitianRules(participants) {
    const clientCount = participants.filter(x => x.role === "CLIENT").length;
    const dietitianCount = participants.filter(x => x.role === "DIETITIAN").length;

    if (clientCount !== 1 || dietitianCount !== 1) {
      throw new Error("Danışan-diyetisyen konuşması geçersiz.");
    }
  }

  ensureMerchantInternalRules(user, conversation, participants) {
    if (user.role === "CLIENT") {
      throw new Error("Danışan işletme içi konuşmaya katılamaz.");
    }

    const invalidParticipant = participants.find(x => x.merchantId !== conversation.merchantId);

    if (invalidParticipant) {
      throw new Error("Farklı işletme kullanıcısı bu konuşmaya eklenemez.");
    }
  }
}
```

---

# 17. Transaction Kullanılması Gereken Yerler

Şu işlemler transaction içinde yapılmalı:

## 17.1 Conversation oluşturma

```txt
Conversation create
Participant createMany
```

## 17.2 Mesaj gönderme

```txt
Message create
Conversation lastMessage update
Receipt createMany
```

## 17.3 Okundu işaretleme

```txt
Participant lastRead update
Receipt updateMany
```

---

# 18. Önerilen API Endpoint Listesi

```txt
POST   /chat/conversations/client-dietitian
POST   /chat/conversations/merchant-internal
GET    /chat/conversations
GET    /chat/conversations/:conversationId
PATCH  /chat/conversations/:conversationId/archive

GET    /chat/conversations/:conversationId/messages
POST   /chat/conversations/:conversationId/messages
DELETE /chat/messages/:messageId

POST   /chat/conversations/:conversationId/read
POST   /chat/conversations/:conversationId/typing

GET    /chat/users/online-status
```

---

# 19. Güvenlik Kuralları

## 19.1 JWT Kontrolü

HTTP ve WebSocket aynı auth mekanizmasını kullanmalı.

```txt
Authorization: Bearer <access_token>
```

Socket bağlantısında:

```ts
io.use(socketAuthMiddleware)
```

Socket auth middleware:

```ts
const token = socket.handshake.auth.token;
```

veya:

```ts
const token = socket.handshake.headers.authorization;
```

---

## 19.2 Kullanıcı ID Client’tan Güvenilmemeli

Mesaj gönderirken `senderId` body’den alınmamalı.

Yanlış:

```json
{
  "senderId": "user_123",
  "content": "Merhaba"
}
```

Doğru:

```ts
const senderId = req.user.id;
```

---

## 19.3 MerchantId Client’tan Güvenilmemeli

MerchantId de mümkün olduğunca token, user-service veya replica üzerinden doğrulanmalı.

---

# 20. Performans Notları

## 20.1 Mesaj Listeleme

Mesajlar offset pagination ile değil cursor pagination ile çekilmeli.

İyi yaklaşım:

```txt
GET /messages?beforeMessageId=xxx&limit=30
```

veya:

```txt
GET /messages?beforeCreatedAt=2026-05-11T17:00:00.000Z
```

## 20.2 Indexler

Kritik indexler:

```prisma
@@index([conversationId, createdAt])
@@index([userId])
@@index([merchantId])
@@index([lastMessageAt])
```

## 20.3 Conversation Listesi

Conversation listesinde `lastMessageAt` ile sıralama yapılmalı.

```sql
ORDER BY lastMessageAt DESC
```

---

# 21. MVP Kapsamı

İlk sürüm için önerilen kapsam:

- Danışan-diyetisyen birebir mesajlaşma
- Merchant internal mesajlaşma
- Conversation listesi
- Mesaj geçmişi
- Mesaj gönderme
- Okundu bilgisi
- WebSocket ile gerçek zamanlı mesaj
- Redis ile online/offline kontrol
- Notify-service’e offline notification event’i

MVP dışında bırakılabilir:

- Dosya gönderme
- Görsel gönderme
- Sesli mesaj
- Mesaj arama
- Mesaj düzenleme
- Mesaj reaksiyonları
- Grup konuşmalarında detaylı yetkiler
- Uçtan uca şifreleme

---

# 22. MVP Sonrası Geliştirmeler

## 22.1 Attachment Desteği

```txt
IMAGE
PDF
AUDIO
VIDEO
```

S3/R2 üzerinden presigned URL ile yükleme yapılabilir.

## 22.2 Message Search

PostgreSQL full-text search veya OpenSearch kullanılabilir.

## 22.3 Reactions

```prisma
model ChatMessageReaction {
  id        String @id @default(cuid())
  messageId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())

  @@unique([messageId, userId, emoji])
}
```

## 22.4 AI Destekli Özellikler

TheFoodHero için ileride çok değerli olabilir:

- Diyetisyen için konuşma özeti
- Danışanın sık sorduğu soruların analizi
- Danışanın motivasyon durumunu analiz etme
- Riskli mesajlarda uyarı üretme
- Diyet planı ile ilgili otomatik cevap önerisi

Örnek:

```txt
“Danışan son 7 günde diyete uyumda zorlandığını 3 kez belirtmiş.”
```

---

# 23. En Kritik Tasarım Kararı

Bence bu serviste en önemli karar şu:

> Chat servisi doğrudan business ownership kuralını kendi içinde korumalı ama kullanıcı/profil detaylarına tam bağımlı olmamalı.

Bu yüzden:

```txt
ChatUserReplica
```

mantıklı.

Auth-service veya user-service down olsa bile chat geçmişi okunabilir. Yeni kullanıcı/rol güncellemeleri event ile replica’ya yansıtılır.

---

# 24. Önerilen Eventler

## User Events

Chat-service şu eventleri dinleyebilir:

```txt
user.created
user.updated
user.deactivated
merchant.user.assigned
merchant.user.removed
client.dietitian.assigned
client.dietitian.unassigned
```

## Chat Events

Chat-service şu eventleri yayınlayabilir:

```txt
chat.message.created
chat.message.read
chat.conversation.created
chat.conversation.archived
chat.user.online
chat.user.offline
```

---

# 25. Sonuç

Bu yapı ile:

- Danışanlar birbirine mesaj atamaz.
- Diyetisyen-danışan mesajlaşması güvenli yürür.
- Merchant/clinic ekibi kendi içinde konuşabilir.
- Chat-service bağımsız mikroservis olarak çalışır.
- PostgreSQL kalıcı veriyi, Redis gerçek zamanlı durumu yönetir.
- Notify-service ile offline bildirim gönderilebilir.
- MVP sonrası dosya, medya, AI özet, görüntülü görüşme gibi özellikler eklenebilir.

Önerilen MVP tablo seti:

```txt
ChatUserReplica
Conversation
ConversationParticipant
ChatMessage
ChatMessageReceipt
```

Bu set TheFoodHero için hem sade hem de büyümeye açık olur.

---
title: "Conectores de Plataforma"
sidebarTitle: "Connectors"
description: "Puentes de plataforma para 27 plataformas de mensajería — 18 habilitados automáticamente desde la configuración (Discord, Telegram, Slack, WhatsApp, Signal, iMessage, Blooio, MS Teams, Google Chat, Twitter, Farcaster, Twitch, Mattermost, Matrix, Feishu, Nostr, Lens, WeChat) más 9 instalables desde el registro (Bluesky, Instagram, LINE, Zalo, Twilio, GitHub, Gmail Watch, Nextcloud Talk, Tlon)."
---

Los conectores son puentes de plataforma que permiten a tu agente comunicarse a través de plataformas de mensajería y redes sociales. Cada conector gestiona la autenticación, el enrutamiento de mensajes, la gestión de sesiones y las funcionalidades específicas de cada plataforma.

<div id="table-of-contents">
## Tabla de Contenidos
</div>

1. [Plataformas compatibles](#supported-platforms)
2. [Configuración general](#general-configuration)
3. [Discord](#discord)
4. [Telegram](#telegram)
5. [Slack](#slack)
6. [WhatsApp](#whatsapp)
7. [Signal](#signal)
8. [iMessage](#imessage)
9. [Blooio](#blooio)
10. [Microsoft Teams](#microsoft-teams)
11. [Google Chat](#google-chat)
12. [Twitter](#twitter)
13. [Farcaster](#farcaster)
14. [Bluesky](#bluesky)
15. [Instagram](#instagram)
16. [Twitch](#twitch)
17. [Mattermost](#mattermost)
18. [WeChat](#wechat)
19. [Matrix](#matrix)
20. [Feishu / Lark](#feishu--lark)
21. [Nostr](#nostr)
22. [LINE](#line)
23. [Zalo](#zalo)
24. [Twilio](#twilio)
25. [GitHub](#github)
26. [Gmail Watch](#gmail-watch)
27. [Nextcloud Talk](#nextcloud-talk)
28. [Tlon](#tlon)
29. [Lens](#lens)
30. [Ciclo de vida del conector](#connector-lifecycle)
31. [Soporte multi-cuenta](#multi-account-support)
32. [Gestión de sesiones](#session-management)

---

<div id="supported-platforms">
## Plataformas compatibles
</div>

Los conectores marcados como **Auto** se cargan automáticamente cuando su configuración está presente en `milady.json`. Los conectores marcados como **Registry** deben instalarse primero con `milady plugins install <package>`.

| Plataforma | Método de autenticación | Soporte de MD | Soporte de grupo | Multi-cuenta | Disponibilidad |
|----------|------------|------------|---------------|---------------|-------------|
| Discord | Token de bot | Sí | Sí (servidores/canales) | Sí | Auto |
| Telegram | Token de bot | Sí | Sí (grupos/temas) | Sí | Auto |
| Slack | Tokens de bot + app | Sí | Sí (canales/hilos) | Sí | Auto |
| WhatsApp | Código QR (Baileys) o Cloud API | Sí | Sí | Sí | Auto |
| Signal | API HTTP de signal-cli | Sí | Sí | Sí | Auto |
| iMessage | CLI nativo (macOS) | Sí | Sí | Sí | Auto |
| Blooio | Clave API + webhook | Sí | Sí | No | Auto |
| Microsoft Teams | ID de app + contraseña | Sí | Sí (equipos/canales) | No | Auto |
| Google Chat | Cuenta de servicio | Sí | Sí (espacios) | Sí | Auto |
| Twitter | Claves API + tokens | MDs | N/A | No | Registry |
| Farcaster | Clave API de Neynar + firmante | Casts | Sí (canales) | No | Auto |
| Twitch | Client ID + token de acceso | Sí (chat) | Sí (canales) | No | Auto |
| Mattermost | Token de bot | Sí | Sí (canales) | No | Auto |
| WeChat | Clave API de proxy + código QR | Sí | Sí | Sí | Auto |
| Matrix | Token de acceso | Sí | Sí (salas) | No | Auto |
| Feishu / Lark | ID de app + secreto | Sí | Sí (chats grupales) | No | Auto |
| Nostr | Clave privada (nsec/hex) | Sí (NIP-04) | N/A | No | Auto |
| Lens | Clave API | Sí | N/A | No | Registry |
| Bluesky | Credenciales de cuenta | Publicaciones | N/A | No | Registry |
| Instagram | Usuario + contraseña | MDs | N/A | No | Registry |
| LINE | Token de acceso de canal + secreto | Sí | Sí | No | Registry |
| Zalo | Token de acceso | Sí | Sí | No | Registry |
| Twilio | Account SID + token de auth | SMS/Voz | N/A | No | Registry |
| GitHub | Token de API | Issues/PRs | Sí (repos) | No | Registry |
| Gmail Watch | Cuenta de servicio / OAuth | N/A | N/A | No | Registry |
| Nextcloud Talk | Credenciales del servidor | Sí | Sí (salas) | No | Registry |
| Tlon | Credenciales del ship | Sí | Sí (chats de Urbit) | No | Registry |

---

<div id="general-configuration">
## Configuración general
</div>

Los conectores se configuran en la sección `connectors` de `milady.json`. Campos comunes compartidos entre la mayoría de los conectores:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `enabled` | boolean | Habilitar o deshabilitar el conector |
| `dmPolicy` | string | Aceptación de MDs: `"pairing"` (por defecto), `"open"` o `"closed"` |
| `allowFrom` | string[] | Lista de permitidos de IDs de usuario (requerida cuando `dmPolicy: "open"`) |
| `groupPolicy` | string | Política de mensajes de grupo: `"allowlist"` (por defecto) o `"open"` |
| `groupAllowFrom` | string[] | Lista de permitidos de IDs de grupo |
| `historyLimit` | number | Máximo de mensajes a cargar del historial de conversación |
| `dmHistoryLimit` | number | Máximo de mensajes para el historial de MDs |
| `textChunkLimit` | number | Máximo de caracteres por fragmento de mensaje |
| `chunkMode` | string | `"length"` o `"newline"` -- cómo dividir mensajes largos |
| `blockStreaming` | boolean | Desactivar respuestas en streaming |
| `mediaMaxMb` | number | Tamaño máximo de archivos adjuntos en MB |
| `configWrites` | boolean | Permitir al agente modificar su propia configuración |
| `capabilities` | string[] | Flags de funcionalidades para este conector |
| `markdown` | object | Configuración de renderizado de Markdown |
| `heartbeat` | object | Configuración de visibilidad del heartbeat del canal |

---

<div id="discord">
## Discord
</div>

<div id="setup-requirements">
### Requisitos de configuración
</div>

- Token de bot de Discord (desde el Portal de Desarrolladores de Discord)
- El bot debe ser invitado a los servidores objetivo con los permisos apropiados

<div id="key-configuration">
### Configuración clave
</div>

```json
{
  "connectors": {
    "discord": {
      "enabled": true,
      "token": "BOT_TOKEN",
      "groupPolicy": "allowlist",
      "guilds": {
        "SERVER_ID": {
          "requireMention": true,
          "channels": {
            "CHANNEL_ID": {
              "allow": true,
              "requireMention": false
            }
          }
        }
      },
      "dm": {
        "enabled": true,
        "policy": "pairing"
      }
    }
  }
}
```

<div id="features">
### Funcionalidades
</div>

- Configuración por servidor y por canal
- Política de MDs con listas de permitidos
- Notificaciones de reacciones (`off`, `own`, `all`, `allowlist`)
- Aprobaciones de ejecución con usuarios aprobadores designados
- Integración con PluralKit
- Configuración del modo de respuesta
- Configuración de intents (presencia, miembros del servidor)
- Acciones: reacciones, stickers, carga de emojis, encuestas, permisos, mensajes, hilos, fijados, búsqueda, info de miembros/roles/canales, estado de voz, eventos, moderación, presencia

---

<div id="telegram">
## Telegram
</div>

<div id="setup-requirements-1">
### Requisitos de configuración
</div>

- Token de bot de @BotFather

<div id="key-configuration-1">
### Configuración clave
</div>

```json
{
  "connectors": {
    "telegram": {
      "enabled": true,
      "botToken": "BOT_TOKEN",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "groups": {
        "GROUP_ID": {
          "requireMention": true,
          "topics": {
            "TOPIC_ID": {
              "enabled": true
            }
          }
        }
      }
    }
  }
}
```

<div id="features-1">
### Funcionalidades
</div>

- Configuración por grupo y por tema
- Comandos slash personalizados con validación
- Botones inline (alcance: `off`, `dm`, `group`, `all`, `allowlist`)
- Modo webhook (con URL de webhook, secreto y ruta)
- Modo stream (`off`, `partial`, `block`)
- Notificaciones de reacciones y niveles de reacción
- Control de vista previa de enlaces
- Configuración de red (selección automática de familia)
- Soporte de proxy

---

<div id="slack">
## Slack
</div>

<div id="setup-requirements-2">
### Requisitos de configuración
</div>

- Token de bot (`xoxb-...`)
- Token de app (`xapp-...`) para Socket Mode
- Secreto de firma (para modo HTTP)

<div id="key-configuration-2">
### Configuración clave
</div>

```json
{
  "connectors": {
    "slack": {
      "enabled": true,
      "mode": "socket",
      "botToken": "<SLACK_BOT_TOKEN>",
      "appToken": "<SLACK_APP_TOKEN>",
      "groupPolicy": "allowlist",
      "channels": {
        "CHANNEL_ID": {
          "allow": true,
          "requireMention": true
        }
      }
    }
  }
}
```

<div id="features-2">
### Funcionalidades
</div>

- Socket Mode o modo HTTP
- Configuración por canal con listas de permitidos
- Historial con soporte de hilos (alcance de hilo o canal)
- Soporte de token de usuario (solo lectura por defecto)
- Integración de comandos slash (con opción de respuesta efímera)
- Modo de respuesta por tipo de chat (directo, grupo, canal)
- Soporte de canales de grupo de MDs
- Acciones: reacciones, mensajes, fijados, búsqueda, permisos, info de miembros, info de canales, lista de emojis

---

<div id="whatsapp">
## WhatsApp
</div>

<div id="setup-requirements-3">
### Requisitos de configuración
</div>

- Baileys: No se necesitan credenciales externas (escaneo de código QR)
- Cloud API: Token de acceso de WhatsApp Business API e ID de número de teléfono

<div id="key-configuration-3">
### Configuración clave
</div>

```json
{
  "connectors": {
    "whatsapp": {
      "accounts": {
        "default": {
          "enabled": true,
          "authDir": "./auth/whatsapp"
        }
      },
      "dmPolicy": "pairing",
      "sendReadReceipts": true,
      "debounceMs": 0
    }
  }
}
```

<div id="features-3">
### Funcionalidades
</div>

- Directorio de autenticación por cuenta para persistencia de sesión de Baileys
- Modo de auto-chat para pruebas
- Prefijo de mensaje para mensajes salientes
- Reacciones de confirmación (emoji configurable, comportamiento en MD/grupo)
- Debounce para mensajes rápidos
- Configuración por grupo con requisitos de mención
- Acciones: reacciones, enviar mensaje, encuestas

Consulta la [Guía de Integración de WhatsApp](/es/guides/whatsapp) para instrucciones detalladas de configuración.

---

<div id="signal">
## Signal
</div>

<div id="setup-requirements-4">
### Requisitos de configuración
</div>

- signal-cli ejecutándose en modo HTTP/JSON-RPC
- Cuenta de Signal registrada

<div id="key-configuration-4">
### Configuración clave
</div>

```json
{
  "connectors": {
    "signal": {
      "enabled": true,
      "account": "+1234567890",
      "httpUrl": "http://localhost:8080",
      "dmPolicy": "pairing"
    }
  }
}
```

<div id="features-4">
### Funcionalidades
</div>

- Configuración de URL HTTP o host/puerto
- Ruta de CLI con inicio automático opcional
- Configuración de tiempo de espera de inicio (1-120 segundos)
- Modo de recepción (`on-start` o `manual`)
- Opciones de manejo de adjuntos e historias
- Soporte de confirmación de lectura
- Notificaciones de reacciones y niveles

---

<div id="imessage">
## iMessage
</div>

<div id="setup-requirements-5">
### Requisitos de configuración
</div>

- macOS con iMessage configurado
- Herramienta CLI para acceso a iMessage (p. ej., `imessage-exporter`)

<div id="key-configuration-5">
### Configuración clave
</div>

```json
{
  "connectors": {
    "imessage": {
      "enabled": true,
      "cliPath": "/usr/local/bin/imessage-exporter",
      "service": "auto",
      "dmPolicy": "pairing"
    }
  }
}
```

> **Nota de habilitación automática:** El conector se habilita automáticamente cuando se establece `cliPath`. Sin él, el plugin no se cargará.

<div id="features-5">
### Funcionalidades
</div>

- Selección de servicio: `imessage`, `sms` o `auto`
- Configuración de ruta de CLI y ruta de base de datos
- Soporte de host remoto
- Configuración de región
- Opción de inclusión de adjuntos
- Configuración de mención y herramientas por grupo

---

<div id="blooio">
## Blooio
</div>

Se conecta a mensajería de iMessage y SMS a través del servicio Blooio con webhooks firmados.

<div id="setup-requirements-6">
### Requisitos de configuración
</div>

- Clave API de Blooio
- URL de webhook para recibir mensajes

<div id="key-configuration-6">
### Configuración clave
</div>

```json
{
  "connectors": {
    "blooio": {
      "enabled": true,
      "apiKey": "YOUR_BLOOIO_API_KEY",
      "webhookUrl": "https://your-domain.com/blooio/webhook"
    }
  }
}
```

**Variables de entorno:** `BLOOIO_API_KEY`, `BLOOIO_WEBHOOK_URL`

<div id="features-6">
### Funcionalidades
</div>

- Mensajería de iMessage y SMS a través del puente Blooio
- Verificación de webhook firmado para mensajes entrantes
- Envío de mensajes salientes
- Habilitación automática cuando se configura `apiKey`

---

<div id="microsoft-teams">
## Microsoft Teams
</div>

<div id="setup-requirements-7">
### Requisitos de configuración
</div>

- Registro de bot en Azure (ID de app y contraseña de app)
- ID de tenant

<div id="key-configuration-7">
### Configuración clave
</div>

```json
{
  "connectors": {
    "msteams": {
      "enabled": true,
      "botToken": "APP_PASSWORD",
      "appId": "APP_ID",
      "appPassword": "APP_PASSWORD",
      "tenantId": "TENANT_ID",
      "dmPolicy": "pairing"
    }
  }
}
```

> **Nota de habilitación automática:** El conector se habilita automáticamente cuando `botToken`, `token` o `apiKey` está presente en la configuración. Establece `botToken` con la contraseña de la app para activar la habilitación automática.

<div id="features-7">
### Funcionalidades
</div>

- Configuración por equipo y por canal
- Configuración de estilo de respuesta
- Configuración de puerto y ruta de webhook
- Listas de permitidos de hosts de medios (para descarga y autenticación)
- ID de sitio de SharePoint para carga de archivos en chats grupales
- Soporte de medios de hasta 100MB (carga a OneDrive)

---

<div id="google-chat">
## Google Chat
</div>

<div id="setup-requirements-8">
### Requisitos de configuración
</div>

- Cuenta de servicio de Google Cloud con acceso a la API de Chat
- Archivo de clave JSON de cuenta de servicio o configuración inline

<div id="key-configuration-8">
### Configuración clave
</div>

```json
{
  "connectors": {
    "googlechat": {
      "enabled": true,
      "apiKey": "placeholder",
      "serviceAccountFile": "./service-account.json",
      "audienceType": "project-number",
      "audience": "123456789",
      "webhookPath": "/google-chat"
    }
  }
}
```

> **Nota de habilitación automática:** Google Chat usa autenticación de cuenta de servicio, no una clave API tradicional. Incluye `"apiKey": "placeholder"` para activar la habilitación automática — la autenticación real usa el archivo de cuenta de servicio.

<div id="features-8">
### Funcionalidades
</div>

- Autenticación de cuenta de servicio (ruta de archivo o JSON inline)
- Configuración de tipo de audiencia (`app-url` o `project-number`)
- Configuración de ruta y URL de webhook
- Configuración por grupo con requisitos de mención
- Modos de indicador de escritura (`none`, `message`, `reaction`)
- Política de MDs con soporte de chat grupal

---

<div id="twitter">
## Twitter
</div>

<div id="setup-requirements-9">
### Requisitos de configuración
</div>

- Credenciales de Twitter API v2 (clave API, clave secreta API, token de acceso, secreto de token de acceso)

<div id="key-configuration-9">
### Configuración clave
</div>

```json
{
  "connectors": {
    "twitter": {
      "enabled": true,
      "apiKey": "...",
      "apiSecretKey": "...",
      "accessToken": "...",
      "accessTokenSecret": "...",
      "postEnable": true,
      "postIntervalMin": 90,
      "postIntervalMax": 180
    }
  }
}
```

<div id="features-9">
### Funcionalidades
</div>

- Publicación automatizada con intervalos y varianza configurables
- Opción de publicación inmediata
- Monitoreo de búsquedas y menciones
- Selección de algoritmo de timeline (`weighted` o `latest`)
- Respuesta automática a menciones
- Opción de procesamiento de acciones
- Modo de prueba en seco (dry run)
- Longitud máxima de tweet configurable (por defecto: 4000)

---

<div id="farcaster">
## Farcaster
</div>

<div id="setup-requirements-10">
### Requisitos de configuración
</div>

- Clave API de Neynar (desde [neynar.com](https://neynar.com))
- Cuenta de Farcaster con un UUID de firmante de Neynar
- ID de Farcaster (FID) de la cuenta del agente

<div id="key-configuration-10">
### Configuración clave
</div>

```json
{
  "connectors": {
    "farcaster": {
      "enabled": true,
      "apiKey": "YOUR_NEYNAR_API_KEY",
      "signerUuid": "YOUR_SIGNER_UUID",
      "fid": 12345,
      "channels": ["ai", "agents"],
      "castIntervalMin": 120,
      "castIntervalMax": 240
    }
  }
}
```

<div id="features-10">
### Funcionalidades
</div>

- Casting autónomo (publicación) a intervalos configurables
- Respuesta a @menciones y respuestas de casts
- Monitoreo y participación en canales
- Reacciones (likes y recasts)
- Casts directos (mensajes privados)
- Identidad on-chain vinculada a dirección Ethereum
- División de hilos de casts para mensajes de más de 320 caracteres

---

<div id="bluesky">
## Bluesky
</div>

<div id="setup-requirements-11">
### Requisitos de configuración
</div>

- Credenciales de cuenta de Bluesky (handle y contraseña de app)

<div id="key-configuration-11">
### Configuración clave
</div>

```json
{
  "connectors": {
    "bluesky": {
      "enabled": true,
      "postEnable": true,
      "postIntervalMin": 90,
      "postIntervalMax": 180
    }
  }
}
```

**Variables de entorno:** `BLUESKY_ENABLED`, `BLUESKY_DRY_RUN`, `BLUESKY_USERNAME`, `BLUESKY_PASSWORD`, `BLUESKY_HANDLE`

<div id="features-11">
### Funcionalidades
</div>

- Creación de publicaciones a intervalos configurables
- Monitoreo de menciones y respuestas
- Modo de prueba en seco (dry run)
- Red social descentralizada basada en AT Protocol

**Nota:** Este conector está disponible desde el registro de plugins. Instálalo con `milady plugins install @elizaos/plugin-bluesky`.

---

<div id="instagram">
## Instagram
</div>

<div id="setup-requirements-12">
### Requisitos de configuración
</div>

- Credenciales de cuenta de Instagram (usuario y contraseña)

<div id="key-configuration-12">
### Configuración clave
</div>

```json
{
  "connectors": {
    "instagram": {
      "enabled": true
    }
  }
}
```

**Variables de entorno:** `INSTAGRAM_USERNAME`, `INSTAGRAM_PASSWORD`, `INSTAGRAM_DRY_RUN`, `INSTAGRAM_POLL_INTERVAL`, `INSTAGRAM_POST_INTERVAL_MIN`, `INSTAGRAM_POST_INTERVAL_MAX`

<div id="features-12">
### Funcionalidades
</div>

- Publicación de medios con generación de subtítulos
- Monitoreo y respuesta de comentarios
- Manejo de MDs
- Modo de prueba en seco (dry run)
- Intervalos de publicación y sondeo configurables

**Nota:** Este conector está disponible desde el registro de plugins. Instálalo con `milady plugins install @elizaos/plugin-instagram`.

---

<div id="twitch">
## Twitch
</div>

<div id="setup-requirements-13">
### Requisitos de configuración
</div>

- Client ID y token de acceso de la aplicación de Twitch
- Canal de Twitch al que conectarse

<div id="key-configuration-13">
### Configuración clave
</div>

```json
{
  "connectors": {
    "twitch": {
      "enabled": true,
      "clientId": "YOUR_CLIENT_ID",
      "accessToken": "YOUR_ACCESS_TOKEN"
    }
  }
}
```

<div id="features-13">
### Funcionalidades
</div>

- Monitoreo y respuesta de chat en vivo
- Manejo de eventos de canal
- Gestión de interacción con la audiencia
- Habilitación automática cuando se configura `clientId` o `accessToken`

---

<div id="mattermost">
## Mattermost
</div>

<div id="setup-requirements-14">
### Requisitos de configuración
</div>

- Token de bot de Mattermost (desde Consola del Sistema > Integraciones > Cuentas de Bot)
- URL del servidor de Mattermost

<div id="key-configuration-14">
### Configuración clave
</div>

```json
{
  "connectors": {
    "mattermost": {
      "enabled": true,
      "botToken": "YOUR_BOT_TOKEN",
      "baseUrl": "https://chat.example.com",
      "chatmode": "all",
      "requireMention": false
    }
  }
}
```

**Variables de entorno:** `MATTERMOST_BOT_TOKEN`, `MATTERMOST_BASE_URL`

<div id="features-14">
### Funcionalidades
</div>

- Mensajería en canales y MDs
- Restricción de modo de chat (`dm-only`, `channel-only` o `all`)
- Filtrado de menciones (opcionalmente requerir @menciones)
- Activadores de prefijo de comando personalizado
- Soporte de servidor auto-alojado

---

<div id="wechat">
## WeChat
</div>

Se conecta a WeChat a través de un servicio proxy de terceros usando inicio de sesión de cuenta personal.

<div id="setup-requirements-15">
### Requisitos de configuración
</div>

1. Obtener una clave API del servicio proxy de WeChat
2. Configurar la URL del proxy y el puerto del webhook
3. Escanear el código QR mostrado en la terminal en el primer inicio

<div id="privacy-notice">
### Aviso de privacidad
</div>

El conector de WeChat depende de un servicio proxy proporcionado por el usuario. Ese proxy recibe
tu clave API del conector más los payloads de mensajes y metadatos necesarios para retransmitir
el tráfico entrante y saliente de WeChat. Solo apunta `proxyUrl` a infraestructura que
operes tú mismo o en la que confíes explícitamente para ese flujo de mensajes.

<div id="key-configuration-15">
### Configuración clave
</div>

```json
{
  "connectors": {
    "wechat": {
      "apiKey": "<key>",
      "proxyUrl": "https://...",
      "webhookPort": 18790,
      "deviceType": "ipad"
    }
  }
}
```

| Campo | Descripción |
|-------|------------|
| `apiKey` | **Requerido** -- Clave API del servicio proxy |
| `proxyUrl` | **Requerido** -- URL del servicio proxy |
| `webhookPort` | Puerto del listener de webhook (por defecto: 18790) |
| `deviceType` | Tipo de emulación de dispositivo: `ipad` o `mac` (por defecto: `ipad`) |

**Variables de entorno:** `WECHAT_API_KEY`

**Multi-cuenta:** Soportado mediante el mapa `accounts` (mismo patrón que WhatsApp).

<div id="features-15">
### Funcionalidades
</div>

- Mensajería de texto en MDs (habilitado por defecto)
- Soporte de chat grupal (habilitar con `features.groups: true`)
- Envío/recepción de imágenes (habilitar con `features.images: true`)
- Inicio de sesión por código QR con persistencia automática de sesión
- Soporte multi-cuenta mediante mapa de cuentas

---

<div id="matrix">
## Matrix
</div>

<div id="setup-requirements-16">
### Requisitos de configuración
</div>

- Cuenta de Matrix en cualquier homeserver (p. ej., matrix.org o auto-alojado)
- Token de acceso para la cuenta del bot

<div id="key-configuration-16">
### Configuración clave
</div>

```json
{
  "env": {
    "MATRIX_ACCESS_TOKEN": "syt_your_access_token"
  },
  "connectors": {
    "matrix": {
      "enabled": true,
      "token": "syt_your_access_token"
    }
  }
}
```

> **Nota de habilitación automática:** El conector se habilita automáticamente cuando `token`, `botToken` o `apiKey` está presente en la configuración del conector. Establecer solo `"enabled": true` no es suficiente — incluye el campo `token`.

**Variables de entorno:** `MATRIX_ACCESS_TOKEN`, `MATRIX_HOMESERVER`, `MATRIX_USER_ID`, `MATRIX_DEVICE_ID`, `MATRIX_ROOMS`, `MATRIX_AUTO_JOIN`, `MATRIX_ENCRYPTION`, `MATRIX_REQUIRE_MENTION`

<div id="features-16">
### Funcionalidades
</div>

- Mensajería en salas y MDs en cualquier homeserver compatible con la especificación
- Unión automática a invitaciones de salas
- Soporte de cifrado de extremo a extremo (Olm)
- Filtrado de menciones en salas
- Soporte de federación entre homeservers

---

<div id="feishu--lark">
## Feishu / Lark
</div>

<div id="setup-requirements-17">
### Requisitos de configuración
</div>

- App personalizada de Feishu/Lark con ID de App y Secreto de App
- Capacidad de bot habilitada en la app

<div id="key-configuration-17">
### Configuración clave
</div>

```json
{
  "env": {
    "FEISHU_APP_ID": "cli_your_app_id",
    "FEISHU_APP_SECRET": "your_app_secret"
  },
  "connectors": {
    "feishu": {
      "enabled": true,
      "apiKey": "your_app_secret"
    }
  }
}
```

> **Nota de habilitación automática:** El conector se habilita automáticamente cuando `apiKey`, `token` o `botToken` está presente en la configuración del conector. Establece `apiKey` con el secreto de la app para activar la habilitación automática.

**Variables de entorno:** `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_DOMAIN`, `FEISHU_ALLOWED_CHATS`

<div id="features-17">
### Funcionalidades
</div>

- Mensajería directa con bot y chats grupales
- Lista de permitidos de chats para control de acceso
- Soporte de dominio China (`feishu.cn`) y global (`larksuite.com`)
- Suscripción a eventos para mensajes en tiempo real

---

<div id="nostr">
## Nostr
</div>

<div id="setup-requirements-18">
### Requisitos de configuración
</div>

- Clave privada de Nostr (formato nsec o hex)

<div id="key-configuration-18">
### Configuración clave
</div>

```json
{
  "env": {
    "NOSTR_PRIVATE_KEY": "nsec1your_private_key"
  },
  "connectors": {
    "nostr": {
      "enabled": true,
      "token": "placeholder"
    }
  }
}
```

> **Nota de habilitación automática:** Nostr usa autenticación basada en claves, no un token tradicional. Incluye `"token": "placeholder"` en la configuración del conector para activar la habilitación automática — la autenticación real usa la variable de entorno `NOSTR_PRIVATE_KEY`.

**Variables de entorno:** `NOSTR_PRIVATE_KEY`, `NOSTR_RELAYS`, `NOSTR_DM_POLICY`, `NOSTR_ALLOW_FROM`, `NOSTR_ENABLED`

<div id="features-18">
### Funcionalidades
</div>

- Conectividad multi-relay
- Publicación de notas (eventos kind 1)
- Mensajes directos cifrados NIP-04
- Políticas de acceso a MDs (permitir, denegar, lista de permitidos)
- Completamente descentralizado a través de red de relays

---

<div id="line">
## LINE
</div>

<div id="setup-requirements-19">
### Requisitos de configuración
</div>

- Token de acceso de canal de LINE
- Secreto de canal de LINE

<div id="key-configuration-19">
### Configuración clave
</div>

```json
{
  "connectors": {
    "line": {
      "enabled": true
    }
  }
}
```

**Variables de entorno:** `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_CUSTOM_GREETING`

<div id="features-19">
### Funcionalidades
</div>

- Mensajería de bot y conversaciones con clientes
- Tipos de mensajes enriquecidos (texto, sticker, imagen, video)
- Soporte de chat grupal
- Manejo de eventos basado en webhook

**Nota:** Este conector está disponible desde el registro de plugins. Instálalo con `milady plugins install @elizaos/plugin-line`.

---

<div id="zalo">
## Zalo
</div>

<div id="setup-requirements-20">
### Requisitos de configuración
</div>

- Token de acceso de Cuenta Oficial (OA) de Zalo

<div id="key-configuration-20">
### Configuración clave
</div>

```json
{
  "connectors": {
    "zalo": {
      "enabled": true
    }
  }
}
```

**Variables de entorno:** `ZALO_ACCESS_TOKEN`, `ZALO_REFRESH_TOKEN`, `ZALO_APP_ID`, `ZALO_APP_SECRET`

<div id="features-20">
### Funcionalidades
</div>

- Mensajería de cuenta oficial y flujos de trabajo de soporte
- Manejo de mensajes basado en webhook
- Gestión de interacción con clientes

También está disponible una variante de cuenta personal como `@elizaos/plugin-zalouser` para mensajería uno a uno fuera del sistema de Cuenta Oficial.

**Nota:** Este conector está disponible desde el registro de plugins. Instálalo con `milady plugins install @elizaos/plugin-zalo`.

---

<div id="twilio">
## Twilio
</div>

<div id="setup-requirements-21">
### Requisitos de configuración
</div>

- Account SID y Auth Token de Twilio
- Un número de teléfono de Twilio

<div id="key-configuration-21">
### Configuración clave
</div>

```json
{
  "connectors": {
    "twilio": {
      "enabled": true
    }
  }
}
```

**Variables de entorno:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

<div id="features-21">
### Funcionalidades
</div>

- Mensajería SMS (enviar y recibir)
- Capacidades de llamadas de voz
- Manejo de mensajes entrantes basado en webhook

**Nota:** Este conector está disponible desde el registro de plugins. Instálalo con `milady plugins install @elizaos/plugin-twilio`.

---

<div id="github">
## GitHub
</div>

<div id="setup-requirements-22">
### Requisitos de configuración
</div>

- Token de API de GitHub (token de acceso personal o token de grano fino)

<div id="key-configuration-22">
### Configuración clave
</div>

```json
{
  "connectors": {
    "github": {
      "enabled": true
    }
  }
}
```

**Variables de entorno:** `GITHUB_API_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`

<div id="features-22">
### Funcionalidades
</div>

- Gestión de repositorios
- Seguimiento y creación de issues
- Flujos de trabajo de pull requests (crear, revisar, fusionar)
- Búsqueda de código y acceso a archivos

**Nota:** Este conector está disponible desde el registro de plugins. Instálalo con `milady plugins install @elizaos/plugin-github`.

---

<div id="gmail-watch">
## Gmail Watch
</div>

<div id="setup-requirements-23">
### Requisitos de configuración
</div>

- Cuenta de servicio de Google Cloud o credenciales OAuth con acceso a la API de Gmail

<div id="key-configuration-23">
### Configuración clave
</div>

Gmail Watch se habilita a través del flag `features.gmailWatch` o variables de entorno en lugar de la sección `connectors`.

<div id="features-23">
### Funcionalidades
</div>

- Monitoreo de mensajes de Gmail mediante Pub/Sub
- Renovación automática de suscripciones de monitoreo
- Manejo de eventos de correo electrónico entrante

**Nota:** Este conector está disponible desde el registro de plugins. Instálalo con `milady plugins install @elizaos/plugin-gmail-watch`.

---

<div id="nextcloud-talk">
## Nextcloud Talk
</div>

<div id="setup-requirements-24">
### Requisitos de configuración
</div>

- URL del servidor de Nextcloud y credenciales

<div id="key-configuration-24">
### Configuración clave
</div>

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true
    }
  }
}
```

<div id="features-24">
### Funcionalidades
</div>

- Mensajería basada en salas
- Soporte de conversaciones en MDs y grupos
- Integración con plataforma de colaboración auto-alojada

**Nota:** Este conector está disponible desde el registro de plugins. Instálalo con `milady plugins install @elizaos/plugin-nextcloud-talk`.

---

<div id="tlon">
## Tlon
</div>

<div id="setup-requirements-25">
### Requisitos de configuración
</div>

- Credenciales del ship de Tlon (nombre del ship de Urbit y código de acceso)

<div id="key-configuration-25">
### Configuración clave
</div>

```json
{
  "connectors": {
    "tlon": {
      "enabled": true
    }
  }
}
```

**Variables de entorno:** `TLON_SHIP`, `TLON_CODE`, `TLON_URL`

<div id="features-25">
### Funcionalidades
</div>

- Chat e interacciones sociales basadas en Urbit
- Mensajería ship-a-ship
- Participación en chats grupales

**Nota:** Este conector está disponible desde el registro de plugins. Instálalo con `milady plugins install @elizaos/plugin-tlon`.

---

<div id="lens">
## Lens
</div>

**Plugin:** `@elizaos/plugin-lens`

```json5
{
  connectors: {
    lens: {
      apiKey: "<LENS_API_KEY>",
    }
  }
}
```

| Variable de entorno | Ruta de configuración |
|-------------|-------------|
| `LENS_API_KEY` | `connectors.lens.apiKey` |

**Activadores de habilitación automática:** `apiKey`, `token` o `botToken`.

**Funcionalidades:**
- Interacciones sociales en Lens Protocol
- Publicación y participación en posts

---

<div id="connector-lifecycle">
## Ciclo de vida del conector
</div>

El ciclo de vida típico del conector sigue este patrón:

1. **Instalar plugin** -- Los plugins de conector se instalan como paquetes `@elizaos/plugin-{platform}`
2. **Configurar** -- Agregar la configuración de la plataforma a la sección `connectors` de `milady.json`
3. **Habilitar** -- Establecer `enabled: true` en la configuración del conector
4. **Autenticar** -- Proporcionar credenciales (tokens, claves) o completar el flujo de autenticación (escaneo de código QR)
5. **Ejecutar** -- El runtime inicia el conector, establece conexiones y comienza el manejo de mensajes
6. **Monitorear** -- Las sondas de estado verifican la conectividad; la reconexión ocurre automáticamente en caso de fallos

---

<div id="multi-account-support">
## Soporte multi-cuenta
</div>

La mayoría de los conectores soportan múltiples cuentas a través de la clave `accounts`. Cada cuenta tiene su propia configuración, autenticación y estado de sesión:

```json
{
  "connectors": {
    "telegram": {
      "dmPolicy": "pairing",
      "accounts": {
        "main-bot": {
          "enabled": true,
          "botToken": "TOKEN_1"
        },
        "support-bot": {
          "enabled": true,
          "botToken": "TOKEN_2",
          "dmPolicy": "open",
          "allowFrom": ["*"]
        }
      }
    }
  }
}
```

Las configuraciones a nivel de cuenta anulan las configuraciones base del conector. Cada cuenta se ejecuta independientemente con su propia conexión, credenciales y estado de sesión.

---

<div id="session-management">
## Gestión de sesiones
</div>

Todos los conectores gestionan sesiones que rastrean el estado de la conversación entre plataformas:

- **Sesiones de MD** -- una sesión por usuario, gobernada por `dmPolicy`
- **Sesiones de grupo** -- una sesión por grupo/canal, gobernada por `groupPolicy`
- **Historial** -- profundidad de historial de mensajes configurable por tipo de sesión (`historyLimit`, `dmHistoryLimit`)
- **Configuraciones de MD** -- anulaciones de MD por usuario a través del registro `dms`

Las opciones de `dmPolicy` son:

| Política | Comportamiento |
|--------|----------|
| `pairing` | Por defecto. El agente responde después de un flujo de emparejamiento/incorporación. |
| `open` | El agente responde a todos los MDs. Requiere `allowFrom: ["*"]`. |
| `closed` | El agente no responde a MDs. |

---

<div id="connector-operations-runbook">
## Manual de operaciones de conectores
</div>

<div id="setup-checklist">
### Lista de verificación de configuración
</div>

1. Configurar las credenciales del conector bajo `connectors.<name>`.
2. Habilitar la carga del plugin del conector a través de la configuración del conector o la lista de permitidos de plugins.
3. Validar los valores de política de MD/grupo y las listas de permitidos antes de habilitar políticas `open`.
4. Para cada conector, confirmar que el bot/app de la plataforma está creado y los tokens son válidos (ver notas específicas de plataforma abajo).
5. Probar la conectividad en modo `pairing` antes de cambiar al modo `open`.

<div id="failure-modes">
### Modos de fallo
</div>

**Fallos generales de conectores:**

- El plugin del conector no se carga:
  Verificar el mapeo de ID del conector en `packages/agent/src/config/plugin-auto-enable.ts` (en el submódulo `eliza`), la disponibilidad del plugin y las anulaciones de `plugins.entries`. La capa de habilitación automática mapea las claves de configuración del conector a nombres de paquetes de plugins — una discrepancia significa que el plugin se omite silenciosamente.
- La autenticación tiene éxito pero no llegan mensajes:
  Verificar la configuración de webhook/socket de la plataforma y las puertas de política (`dmPolicy`, `groupPolicy`). Para conectores basados en webhook, confirmar que la URL de callback es accesible públicamente.
- Secretos de conector mal enrutados:
  Confirmar que las variables de entorno esperadas están pobladas desde la configuración y no son sobrescritas por entorno obsoleto. El esquema de configuración fusiona variables de entorno con la configuración de archivo — el entorno tiene precedencia.

**Discord:**

- Token de bot rechazado (`401 Unauthorized`):
  Regenerar el token de bot en el Portal de Desarrolladores de Discord. Los tokens se invalidan si se restablece la contraseña del bot o si el token se filtra y es revocado automáticamente.
- El bot está en línea pero no responde en canales:
  Verificar que el bot tiene el intent `MESSAGE_CONTENT` habilitado en el Portal de Desarrolladores y que `groupPolicy` no está en `closed`. Confirmar que el bot tiene permiso de `Send Messages` en el canal objetivo.
- Limitación de tasa (`429 Too Many Requests`):
  Los límites de tasa de Discord son por ruta. El conector debería retroceder automáticamente. Si es persistente, reducir la frecuencia de mensajes o verificar si hay bucles de mensajes (bot respondiéndose a sí mismo).

**Telegram:**

- El webhook no recibe actualizaciones:
  Telegram requiere HTTPS con un certificado válido. Usa `getWebhookInfo` para verificar el estado. Si usas long polling, confirma que ningún otro proceso está haciendo polling del mismo token de bot (Telegram permite solo un consumidor).
- Token de bot expirado o revocado:
  Recrear el bot vía BotFather y actualizar `TELEGRAM_BOT_TOKEN`. Los tokens de Telegram no expiran automáticamente pero pueden ser revocados.
- Mensajes retrasados o faltantes:
  Telegram almacena actualizaciones en buffer hasta por 24 horas si el webhook no es accesible. Después de restaurar la conectividad, puede llegar una ráfaga de mensajes acumulados.

**Slack:**

- `invalid_auth` o `token_revoked`:
  Reinstalar la app de Slack en el workspace. Los tokens de bot se revocan cuando la app se desinstala o los permisos del workspace cambian.
- Los eventos no llegan:
  Confirmar que la suscripción de Events API incluye los tipos de eventos requeridos (`message.im`, `message.channels`). Verificar que la Request URL de la app de Slack está verificada y recibiendo respuestas de challenge.

**WhatsApp:**

- El emparejamiento QR falla o la sesión se cae:
  Las sesiones de WhatsApp Web expiran después de inactividad prolongada. Volver a emparejar escaneando un nuevo código QR vía `POST /api/whatsapp/pair`. El servicio `whatsapp-pairing` gestiona el estado de sesión.
- Los mensajes no se entregan:
  WhatsApp aplica políticas estrictas anti-spam. Si el número está marcado, los mensajes se descartan silenciosamente. Confirmar que la cuenta de negocio está en buen estado.
- Problemas con el directorio de autenticación multi-cuenta:
  Cada cuenta de WhatsApp requiere su propio `authDir` (estado de autenticación multi-archivo de Baileys). Si múltiples cuentas comparten un directorio, las sesiones se corrompen entre sí.

**Signal:**

- signal-cli no encontrado:
  El conector requiere `signal-cli` en PATH o un `cliPath` configurado. Para modo HTTP, establecer `httpUrl` o `httpHost`/`httpPort` apuntando a una API REST de signal-cli en ejecución.
- El registro de cuenta falla:
  Signal requiere un número de teléfono verificado. Usa `signal-cli register` o proporciona un número de cuenta pre-registrado vía `connectors.signal.account`.
- Configuración multi-cuenta:
  Signal soporta múltiples cuentas a través del mapa `accounts`. Cada cuenta debe tener `account`, `httpUrl` o `cliPath` establecido y no debe estar `enabled: false`.

**Twitter:**

- Clave API rechazada:
  Confirmar que `connectors.twitter.apiKey` es una clave API válida de Twitter/X. Las claves del tier gratuito tienen límites de tasa estrictos.
- Fallos en la obtención de tweets:
  La API de FxTwitter (`api.fxtwitter.com`) se usa para verificación de tweets. Si está limitada por tasa, las solicitudes de verificación fallan silenciosamente.

**iMessage (directo):**

- Ruta de CLI no encontrada:
  Requiere `cliPath` apuntando a una herramienta CLI de iMessage válida. Solo macOS — se requieren permisos de Accesibilidad.

**Farcaster:**

- Clave API inválida:
  Confirmar que `connectors.farcaster.apiKey` está establecido. El acceso al hub de Farcaster requiere una clave API válida.

**Lens:**

- Clave API inválida:
  Confirmar que `connectors.lens.apiKey` está establecido y que la API de Lens es accesible.

**MS Teams:**

- Token de bot rechazado:
  Los bots de Teams requieren registro en Azure AD. Confirmar que el token de bot es válido y que la app tiene los permisos requeridos en el portal de Azure.

**Mattermost:**

- La autenticación por token falla:
  Confirmar que `connectors.mattermost.botToken` (env: `MATTERMOST_BOT_TOKEN`) es un token de acceso personal o token de bot válido. Verificar que la URL del servidor de Mattermost está configurada.

**Google Chat / Feishu:**

- La autenticación por token falla:
  Ambos requieren tokens de cuenta de servicio o bot. Confirmar que el token es válido y tiene los scopes requeridos de API de chat.

**Matrix:**

- La conexión al homeserver falla:
  Confirmar que la URL del homeserver de Matrix es accesible y que el token de acceso bajo `connectors.matrix.token` es válido.

**Nostr:**

- La conexión al relay falla:
  Los conectores de Nostr se comunican a través de relays. Confirmar que las URLs de los relays están configuradas y son accesibles. La autenticación por clave API varía según el relay.

**Twitch:**

- La autenticación falla:
  Confirmar que `connectors.twitch.accessToken` o `connectors.twitch.clientId` está establecido. Alternativamente, establecer `enabled: true` para forzar la habilitación. Asegurar que el token de acceso tiene los scopes de chat requeridos.

**Blooio:**

- La autenticación falla:
  Blooio usa `apiKey`. Confirmar que las credenciales están establecidas bajo la configuración del conector.

**Bluesky:**

- La autenticación falla:
  Confirmar que las variables de entorno `BLUESKY_USERNAME` y `BLUESKY_PASSWORD` están establecidas. Bluesky usa contraseñas de app, no la contraseña principal de tu cuenta.

**Instagram:**

- El inicio de sesión falla o la cuenta se bloquea:
  Instagram puede requerir verificación para inicios de sesión automatizados. Usa una contraseña específica de app si está disponible. Evita intentos de inicio de sesión frecuentes que pueden activar bloqueos de cuenta.

**LINE:**

- El webhook no recibe mensajes:
  Confirmar que `LINE_CHANNEL_ACCESS_TOKEN` y `LINE_CHANNEL_SECRET` están establecidos. La URL del webhook debe ser accesible públicamente con HTTPS.

**Twilio:**

- SMS no se envía:
  Confirmar que `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_PHONE_NUMBER` están establecidos. Verificar que el número de teléfono es capaz de SMS y que la cuenta tiene saldo suficiente.

**GitHub:**

- Token de API rechazado:
  Confirmar que `GITHUB_API_TOKEN` es un token de acceso personal válido o token de grano fino con los permisos de repositorio requeridos.

<div id="recovery-procedures">
### Procedimientos de recuperación
</div>

1. **Sesión de conector obsoleta:** Reiniciar el agente. Los conectores reinicializan sus conexiones de plataforma al inicio. Para conectores basados en WebSocket (Discord, Slack), esto fuerza un nuevo handshake.
2. **Rotación de tokens:** Actualizar el token en `milady.json` bajo `connectors.<name>` y reiniciar. No edites variables de entorno en un proceso en ejecución — la configuración se lee al inicio.
3. **Recuperación de límite de tasa:** El agente retrocede automáticamente en respuestas 429. Si el conector está completamente bloqueado, esperar a que la ventana de límite de tasa expire (típicamente 1–60 segundos para Discord, varía según plataforma) y reiniciar.

<div id="verification-commands">
### Comandos de verificación
</div>

Estas rutas de prueba hacen referencia a archivos en el submódulo `eliza`. Ejecute `bun run setup:upstreams` primero para inicializarlo.

```bash
# Suite de pruebas completa (desde la raíz del repositorio)
bun run test

# Pruebas de extremo a extremo
bun run test:e2e

bun run typecheck
```

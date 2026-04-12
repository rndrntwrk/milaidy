import type { CharacterLanguage } from "@miladyai/shared/contracts/onboarding";
import { normalizeCharacterLanguage } from "../onboarding-presets.js";

export type ContextSignalKey =
  | "calendar"
  | "gmail"
  | "read_channel"
  | "search_conversations"
  | "search_entity"
  | "send_admin_message"
  | "send_message"
  | "stream_control"
  | "web_search";

export type ContextSignalStrength = "strong" | "weak";

type RawContextSignalTerms = {
  strong: string;
  weak?: string;
};

type ContextSignalSpec = {
  contextLimit?: number;
  weakThreshold?: number;
  base: RawContextSignalTerms;
  locales?: Partial<Record<CharacterLanguage, Partial<RawContextSignalTerms>>>;
};

export type ResolvedContextSignalSpec = {
  locale: CharacterLanguage;
  contextLimit: number;
  weakThreshold: number;
  strongTerms: string[];
  weakTerms: string[];
};

const DEFAULT_CONTEXT_LIMIT = 8;
const DEFAULT_WEAK_THRESHOLD = 2;

function termDoc(value: string): string {
  return value.trim();
}

function splitTermDoc(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();
  const terms: string[] = [];
  for (const entry of value.split(/\n+/)) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    terms.push(trimmed);
  }
  return terms;
}

const CONTEXT_SIGNAL_SPECS: Record<ContextSignalKey, ContextSignalSpec> = {
  gmail: {
    contextLimit: 12,
    weakThreshold: 1,
    base: {
      strong: termDoc(`
        email
        emails
        e-mail
        gmail
        mail
        message
        messages
      `),
    },
    locales: {
      "zh-CN": {
        strong: termDoc(`
          邮件
          电子邮件
          邮箱
          消息
        `),
      },
      ko: {
        strong: termDoc(`
          이메일
          메일
          지메일
          메시지
          메세지
        `),
      },
      es: {
        strong: termDoc(`
          correo
          correo electronico
          correo electrónico
          mensaje
        `),
      },
      pt: {
        strong: termDoc(`
          correio
          correio eletronico
          correio eletrônico
          mensagem
        `),
      },
      vi: {
        strong: termDoc(`
          thư điện tử
          thu dien tu
          thư
          tin nhắn
        `),
      },
      tl: {
        strong: termDoc(`
          koreo
          liham
          mensahe
        `),
      },
    },
  },
  calendar: {
    contextLimit: 12,
    base: {
      strong: termDoc(`
        calendar
        event
        events
        flight
        flights
        meeting
        meetings
        appointment
        appointments
        trip
        travel
        itinerary
        agenda
        schedule
        hotel
        hotels
      `),
      weak: termDoc(`
        time
        awake
        sleep
        earlier
        later
        book
        booking
        booked
        check
        free
        busy
        week
        yesterday
        today
        tomorrow
        tonight
        month
        year
      `),
    },
    locales: {
      "zh-CN": {
        strong: termDoc(`
          日历
          行程
          事件
          活动
          航班
          会议
          约会
          旅行
          差旅
          酒店
          议程
          安排
        `),
        weak: termDoc(`
          时间
          早点
          晚点
          预订
          查看
          空闲
          忙
          周
          昨天
          今天
          明天
          今晚
          月
          年
        `),
      },
      ko: {
        strong: termDoc(`
          캘린더
          일정
          이벤트
          항공편
          비행기
          미팅
          회의
          약속
          여행
          일정표
          호텔
        `),
        weak: termDoc(`
          시간
          일찍
          늦게
          예약
          확인
          한가해
          바빠
          주
          어제
          오늘
          내일
          오늘밤
          달
          년
        `),
      },
      es: {
        strong: termDoc(`
          calendario
          evento
          eventos
          vuelo
          vuelos
          reunion
          reunión
          reuniones
          cita
          citas
          viaje
          itinerario
          agenda
          horario
          hotel
          hoteles
        `),
        weak: termDoc(`
          hora
          temprano
          tarde
          reservar
          reserva
          libre
          ocupado
          semana
          ayer
          hoy
          manana
          mañana
          noche
          mes
          ano
          año
        `),
      },
      pt: {
        strong: termDoc(`
          calendario
          evento
          eventos
          voo
          voos
          reuniao
          reunião
          reunioes
          reuniões
          compromisso
          compromissos
          viagem
          itinerario
          itinerário
          agenda
          horario
          horário
          hotel
          hoteis
          hotéis
        `),
        weak: termDoc(`
          hora
          cedo
          tarde
          reservar
          reserva
          livre
          ocupado
          semana
          ontem
          hoje
          amanha
          amanhã
          noite
          mes
          mês
          ano
        `),
      },
      vi: {
        strong: termDoc(`
          lịch
          sự kiện
          cuộc họp
          chuyến bay
          du lịch
          hành trình
          lịch trình
          khách sạn
        `),
        weak: termDoc(`
          giờ
          sớm
          muộn
          đặt
          rảnh
          bận
          tuần
          hôm qua
          hôm nay
          ngày mai
          tối nay
          tháng
          năm
        `),
      },
      tl: {
        strong: termDoc(`
          kalendaryo
          kaganapan
          lipad
          pulong
          appointment
          biyahe
          itinerary
          iskedyul
          hotel
        `),
        weak: termDoc(`
          oras
          maaga
          mamaya
          reserba
          libre
          abala
          linggo
          kahapon
          ngayon
          bukas
          gabi
          buwan
          taon
        `),
      },
    },
  },
  web_search: {
    contextLimit: 6,
    base: {
      strong: termDoc(`
        search
        google
        look up
        look it up
        web search
        search the web
        search online
        search for
        find out
        browse for
      `),
      weak: termDoc(`
        what is
        who is
        when did
        latest
        recent
        news
        current
        today
        how much
        price of
        where is
        find
        research
        check
      `),
    },
    locales: {
      "zh-CN": {
        strong: termDoc(`
          搜索
          查一下
          查一查
          上网查
          网页搜索
          谷歌
          google
          百度
        `),
        weak: termDoc(`
          最新
          最近
          新闻
          当前
          今天
          价格
          研究
          查
        `),
      },
      ko: {
        strong: termDoc(`
          검색
          찾아봐
          찾아봐줘
          웹 검색
          구글
          google
        `),
        weak: termDoc(`
          최신
          최근
          뉴스
          현재
          오늘
          가격
          조사
          확인
        `),
      },
      es: {
        strong: termDoc(`
          buscar
          busca
          googlea
          googlear
          busca en la web
          busca en internet
          investiga
        `),
        weak: termDoc(`
          ultimo
          última
          ultimo
          reciente
          noticias
          actual
          hoy
          precio
          investigar
          revisar
        `),
      },
      pt: {
        strong: termDoc(`
          buscar
          pesquisa
          pesquise
          google
          procura na web
          procura online
        `),
        weak: termDoc(`
          ultimo
          último
          recente
          noticias
          notícias
          atual
          hoje
          preço
          preco
          pesquisar
          conferir
        `),
      },
      vi: {
        strong: termDoc(`
          tìm
          tìm kiếm
          tra cứu
          tra cuu
          google
          tìm trên web
        `),
        weak: termDoc(`
          mới nhất
          gần đây
          tin tức
          hiện tại
          hôm nay
          giá
          nghiên cứu
          kiểm tra
        `),
      },
      tl: {
        strong: termDoc(`
          hanapin
          maghanap
          i-google
          google
          hanap sa web
        `),
        weak: termDoc(`
          pinakabago
          kamakailan
          balita
          kasalukuyan
          ngayon
          presyo
          research
          check
        `),
      },
    },
  },
  send_message: {
    base: {
      strong: termDoc(`
        send message
        send a message
        dm
        direct message
        notify
        alert
        tell them
        message them
        reach out
        post to
        post in
      `),
      weak: termDoc(`
        send
        message
        tell
        notify
        alert
        admin
        owner
        urgent
        escalate
        channel
        room
      `),
    },
    locales: {
      "zh-CN": {
        strong: termDoc(`
          发消息
          发送消息
          私信
          通知
          提醒
        `),
        weak: termDoc(`
          发送
          消息
          通知
          提醒
          管理员
          owner
          紧急
          频道
          房间
        `),
      },
      ko: {
        strong: termDoc(`
          메시지 보내
          메세지 보내
          쪽지
          디엠
          dm
          알려줘
          전달해
        `),
        weak: termDoc(`
          보내
          메시지
          알림
          관리자
          owner
          긴급
          채널
          방
        `),
      },
      es: {
        strong: termDoc(`
          enviar mensaje
          manda mensaje
          mensaje directo
          dm
          notifica
          avisa
        `),
        weak: termDoc(`
          enviar
          mensaje
          avisar
          notificar
          alerta
          admin
          owner
          urgente
          canal
          sala
        `),
      },
      pt: {
        strong: termDoc(`
          enviar mensagem
          manda mensagem
          mensagem direta
          dm
          notifica
          avisa
        `),
        weak: termDoc(`
          enviar
          mensagem
          avisar
          notificar
          alerta
          admin
          owner
          urgente
          canal
          sala
        `),
      },
      vi: {
        strong: termDoc(`
          gửi tin nhắn
          gui tin nhan
          nhắn tin
          dm
          thông báo
          nhắc
        `),
        weak: termDoc(`
          gửi
          tin nhắn
          thông báo
          khẩn cấp
          kênh
          phòng
        `),
      },
      tl: {
        strong: termDoc(`
          magpadala ng mensahe
          padalhan ng mensahe
          dm
          direktang mensahe
          abisuhan
        `),
        weak: termDoc(`
          padala
          mensahe
          abiso
          alerto
          admin
          owner
          urgent
          channel
          room
        `),
      },
    },
  },
  send_admin_message: {
    base: {
      strong: termDoc(`
        message admin
        notify owner
        alert admin
        tell admin
        tell owner
        escalate
      `),
      weak: termDoc(`
        admin
        owner
        notify
        alert
        urgent
        escalate
        important
      `),
    },
    locales: {
      "zh-CN": {
        strong: termDoc(`
          通知管理员
          告诉管理员
          通知 owner
          升级处理
        `),
        weak: termDoc(`
          管理员
          owner
          通知
          提醒
          紧急
          升级
          重要
        `),
      },
      ko: {
        strong: termDoc(`
          관리자에게 알려
          관리자한테 말해
          owner에게 알려
          에스컬레이션
        `),
        weak: termDoc(`
          관리자
          owner
          알림
          긴급
          중요
          에스컬레이션
        `),
      },
      es: {
        strong: termDoc(`
          avisar al admin
          avisar al owner
          decirle al admin
          escalar
        `),
        weak: termDoc(`
          admin
          owner
          avisar
          alerta
          urgente
          escalar
          importante
        `),
      },
      pt: {
        strong: termDoc(`
          avisar o admin
          avisar o owner
          falar com o admin
          escalar
        `),
        weak: termDoc(`
          admin
          owner
          avisar
          alerta
          urgente
          escalar
          importante
        `),
      },
      vi: {
        strong: termDoc(`
          báo admin
          bao admin
          báo owner
          leo thang
        `),
        weak: termDoc(`
          admin
          owner
          báo
          khẩn cấp
          quan trọng
        `),
      },
      tl: {
        strong: termDoc(`
          sabihan ang admin
          abisuhan ang owner
          i-escalate
        `),
        weak: termDoc(`
          admin
          owner
          abiso
          urgent
          importante
          escalate
        `),
      },
    },
  },
  search_conversations: {
    base: {
      strong: termDoc(`
        search conversations
        search chats
        search messages
        find messages
        find conversation
      `),
      weak: termDoc(`
        search
        find
        recall
        remember
        said
        mentioned
        talked about
        discussed
        earlier
        previously
        conversation
      `),
    },
    locales: {
      "zh-CN": {
        strong: termDoc(`
          搜索对话
          搜索聊天
          搜索消息
          查找消息
        `),
        weak: termDoc(`
          搜索
          查找
          记得
          提到
          聊过
          之前
          对话
        `),
      },
      ko: {
        strong: termDoc(`
          대화 검색
          채팅 검색
          메시지 검색
          메시지 찾기
        `),
        weak: termDoc(`
          검색
          찾기
          기억
          말했
          언급
          이전
          대화
        `),
      },
      es: {
        strong: termDoc(`
          buscar conversaciones
          buscar chats
          buscar mensajes
          encontrar mensajes
        `),
        weak: termDoc(`
          buscar
          encontrar
          recordar
          dijiste
          mencionaste
          antes
          conversación
          conversacion
        `),
      },
      pt: {
        strong: termDoc(`
          buscar conversas
          buscar chats
          buscar mensagens
          encontrar mensagens
        `),
        weak: termDoc(`
          buscar
          encontrar
          lembrar
          falou
          mencionou
          antes
          conversa
        `),
      },
      vi: {
        strong: termDoc(`
          tìm cuộc trò chuyện
          tìm tin nhắn
          tra cứu cuộc trò chuyện
        `),
        weak: termDoc(`
          tìm
          nhớ
          nói
          nhắc
          trước đó
          cuộc trò chuyện
        `),
      },
      tl: {
        strong: termDoc(`
          hanapin ang usapan
          hanapin ang chat
          hanapin ang mensahe
        `),
        weak: termDoc(`
          hanap
          tandaan
          sinabi
          nabanggit
          dati
          usapan
        `),
      },
    },
  },
  read_channel: {
    base: {
      strong: termDoc(`
        read channel
        read chat
        read messages
        channel history
        chat history
        chat log
        message history
        scroll back
        read room
      `),
      weak: termDoc(`
        channel
        chat
        history
        messages
        conversation
        read
        room
        log
        recent
        earlier
      `),
    },
    locales: {
      "zh-CN": {
        strong: termDoc(`
          读取频道
          查看聊天
          查看消息记录
          频道历史
          聊天记录
        `),
        weak: termDoc(`
          频道
          聊天
          历史
          消息
          对话
          查看
          房间
          最近
          之前
        `),
      },
      ko: {
        strong: termDoc(`
          채널 읽기
          채팅 읽기
          메시지 기록
          채널 기록
          채팅 기록
        `),
        weak: termDoc(`
          채널
          채팅
          기록
          메시지
          대화
          읽기
          방
          최근
          이전
        `),
      },
      es: {
        strong: termDoc(`
          leer canal
          leer chat
          historial del canal
          historial del chat
          registro del chat
        `),
        weak: termDoc(`
          canal
          chat
          historial
          mensajes
          conversación
          conversacion
          leer
          sala
          reciente
          antes
        `),
      },
      pt: {
        strong: termDoc(`
          ler canal
          ler chat
          histórico do canal
          histórico do chat
          registro do chat
        `),
        weak: termDoc(`
          canal
          chat
          histórico
          historico
          mensagens
          conversa
          ler
          sala
          recente
          antes
        `),
      },
      vi: {
        strong: termDoc(`
          đọc kênh
          đọc chat
          lịch sử kênh
          lịch sử chat
        `),
        weak: termDoc(`
          kênh
          chat
          lịch sử
          tin nhắn
          cuộc trò chuyện
          đọc
          phòng
          gần đây
          trước đó
        `),
      },
      tl: {
        strong: termDoc(`
          basahin ang channel
          basahin ang chat
          history ng channel
          history ng chat
        `),
        weak: termDoc(`
          channel
          chat
          history
          mensahe
          usapan
          basahin
          room
          recent
          earlier
        `),
      },
    },
  },
  stream_control: {
    base: {
      strong: termDoc(`
        go live
        go offline
        start stream
        stop stream
        start streaming
        stop streaming
        begin stream
        end stream
      `),
      weak: termDoc(`
        live
        stream
        streaming
        broadcast
        twitch
        youtube
        offline
        online
      `),
    },
    locales: {
      "zh-CN": {
        strong: termDoc(`
          开播
          下播
          开始直播
          停止直播
        `),
        weak: termDoc(`
          直播
          开播
          下播
          在线
          离线
          twitch
          youtube
        `),
      },
      ko: {
        strong: termDoc(`
          방송 시작
          방송 종료
          라이브 시작
          라이브 종료
        `),
        weak: termDoc(`
          라이브
          스트림
          스트리밍
          방송
          트위치
          유튜브
          오프라인
          온라인
        `),
      },
      es: {
        strong: termDoc(`
          salir en vivo
          terminar stream
          iniciar stream
          detener stream
        `),
        weak: termDoc(`
          vivo
          stream
          streaming
          transmisión
          transmision
          twitch
          youtube
          offline
          online
        `),
      },
      pt: {
        strong: termDoc(`
          entrar ao vivo
          encerrar stream
          iniciar stream
          parar stream
        `),
        weak: termDoc(`
          ao vivo
          stream
          streaming
          transmissão
          transmissao
          twitch
          youtube
          offline
          online
        `),
      },
      vi: {
        strong: termDoc(`
          lên sóng
          ket thuc stream
          kết thúc stream
          bắt đầu stream
          bat dau stream
        `),
        weak: termDoc(`
          stream
          phát sóng
          phat song
          trực tiếp
          twitch
          youtube
          offline
          online
        `),
      },
      tl: {
        strong: termDoc(`
          mag live
          tapusin ang stream
          simulan ang stream
          ihinto ang stream
        `),
        weak: termDoc(`
          live
          stream
          streaming
          broadcast
          twitch
          youtube
          offline
          online
        `),
      },
    },
  },
  search_entity: {
    base: {
      strong: termDoc(`
        search entity
        find person
        lookup user
        search contacts
        search rolodex
        who is
        contact details
        view person
        get contact
      `),
      weak: termDoc(`
        person
        contact
        entity
        user
        lookup
        who
        profile
        identity
        rolodex
        details
      `),
    },
    locales: {
      "zh-CN": {
        strong: termDoc(`
          查找联系人
          查人
          搜索联系人
          谁是
          查看资料
        `),
        weak: termDoc(`
          联系人
          用户
          谁
          档案
          身份
          详情
        `),
      },
      ko: {
        strong: termDoc(`
          사람 찾기
          연락처 검색
          사용자 조회
          누구야
          프로필 보기
        `),
        weak: termDoc(`
          사람
          연락처
          사용자
          누구
          프로필
          신원
          정보
        `),
      },
      es: {
        strong: termDoc(`
          buscar persona
          encontrar persona
          buscar contactos
          quien es
          quién es
          ver perfil
        `),
        weak: termDoc(`
          persona
          contacto
          usuario
          quien
          quién
          perfil
          identidad
          detalles
        `),
      },
      pt: {
        strong: termDoc(`
          buscar pessoa
          encontrar pessoa
          buscar contatos
          quem é
          quem e
          ver perfil
        `),
        weak: termDoc(`
          pessoa
          contato
          usuário
          usuario
          quem
          perfil
          identidade
          detalhes
        `),
      },
      vi: {
        strong: termDoc(`
          tìm người
          tìm liên hệ
          tra người dùng
          ai là
          xem hồ sơ
        `),
        weak: termDoc(`
          người
          liên hệ
          người dùng
          ai
          hồ sơ
          danh tính
          chi tiết
        `),
      },
      tl: {
        strong: termDoc(`
          hanapin ang tao
          hanapin ang contact
          sino si
          tingnan ang profile
        `),
        weak: termDoc(`
          tao
          contact
          user
          sino
          profile
          identity
          details
        `),
      },
    },
  },
};

export function resolveContextSignalSpec(
  key: ContextSignalKey,
  localeInput?: unknown,
): ResolvedContextSignalSpec {
  const locale = normalizeCharacterLanguage(localeInput);
  const spec = CONTEXT_SIGNAL_SPECS[key];
  const localized = spec.locales?.[locale];

  return {
    locale,
    contextLimit: spec.contextLimit ?? DEFAULT_CONTEXT_LIMIT,
    weakThreshold: spec.weakThreshold ?? DEFAULT_WEAK_THRESHOLD,
    strongTerms: splitTermDoc(`${spec.base.strong}\n${localized?.strong ?? ""}`),
    weakTerms: splitTermDoc(`${spec.base.weak ?? ""}\n${localized?.weak ?? ""}`),
  };
}

export function getContextSignalTerms(
  key: ContextSignalKey,
  strength: ContextSignalStrength,
  options?: {
    includeAllLocales?: boolean;
    locale?: unknown;
  },
): string[] {
  if (!options?.includeAllLocales) {
    const spec = resolveContextSignalSpec(key, options?.locale);
    return strength === "strong" ? spec.strongTerms : spec.weakTerms;
  }

  const raw = CONTEXT_SIGNAL_SPECS[key];
  return splitTermDoc(
    [
      raw.base[strength],
      ...Object.values(raw.locales ?? {}).map((entry) => entry?.[strength]),
    ]
      .filter((value): value is string => typeof value === "string")
      .join("\n"),
  );
}

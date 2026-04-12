import type { CharacterLanguage } from "../contracts/onboarding.js";
import { normalizeCharacterLanguage } from "../onboarding-presets.js";

type ValidationKeywordDoc = {
  base?: string;
  locales?: Partial<Record<CharacterLanguage, string>>;
};

type ValidationKeywordTree = {
  [key: string]: ValidationKeywordTree | ValidationKeywordDoc;
};

function termDoc(value: string): string {
  return value.trim();
}

const VALIDATION_KEYWORD_DOCS = {
  contextSignal: {
    gmail: {
      strong: {
        base: termDoc(`
          email
          emails
          e-mail
          gmail
          mail
          message
          messages
        `),
        locales: {
          "zh-CN": termDoc(`
            邮件
            电子邮件
            邮箱
            消息
          `),
          ko: termDoc(`
            이메일
            메일
            지메일
            메시지
            메세지
          `),
          es: termDoc(`
            correo
            correo electronico
            correo electrónico
            mensaje
          `),
          pt: termDoc(`
            correio
            correio eletronico
            correio eletrônico
            mensagem
          `),
          vi: termDoc(`
            thư điện tử
            thu dien tu
            thư
            tin nhắn
          `),
          tl: termDoc(`
            koreo
            liham
            mensahe
          `),
        },
      },
    },
    calendar: {
      strong: {
        base: termDoc(`
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
        locales: {
          "zh-CN": termDoc(`
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
          ko: termDoc(`
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
          es: termDoc(`
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
          pt: termDoc(`
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
          vi: termDoc(`
            lịch
            sự kiện
            cuộc họp
            chuyến bay
            du lịch
            hành trình
            lịch trình
            khách sạn
          `),
          tl: termDoc(`
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
        },
      },
      weak: {
        base: termDoc(`
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
        locales: {
          "zh-CN": termDoc(`
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
          ko: termDoc(`
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
          es: termDoc(`
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
          pt: termDoc(`
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
          vi: termDoc(`
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
          tl: termDoc(`
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
      strong: {
        base: termDoc(`
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
        locales: {
          "zh-CN": termDoc(`
            搜索
            查一下
            查一查
            上网查
            网页搜索
            谷歌
            google
            百度
          `),
          ko: termDoc(`
            검색
            찾아봐
            찾아봐줘
            웹 검색
            구글
            google
          `),
          es: termDoc(`
            buscar
            busca
            googlea
            googlear
            busca en la web
            busca en internet
            investiga
          `),
          pt: termDoc(`
            buscar
            pesquisa
            pesquise
            google
            procura na web
            procura online
          `),
          vi: termDoc(`
            tìm
            tìm kiếm
            tra cứu
            tra cuu
            google
            tìm trên web
          `),
          tl: termDoc(`
            hanapin
            maghanap
            i-google
            google
            hanap sa web
          `),
        },
      },
      weak: {
        base: termDoc(`
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
        locales: {
          "zh-CN": termDoc(`
            最新
            最近
            新闻
            当前
            今天
            价格
            研究
            查
          `),
          ko: termDoc(`
            최신
            최근
            뉴스
            현재
            오늘
            가격
            조사
            확인
          `),
          es: termDoc(`
            ultimo
            última
            reciente
            noticias
            actual
            hoy
            precio
            investigar
            revisar
          `),
          pt: termDoc(`
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
          vi: termDoc(`
            mới nhất
            gần đây
            tin tức
            hiện tại
            hôm nay
            giá
            nghiên cứu
            kiểm tra
          `),
          tl: termDoc(`
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
      strong: {
        base: termDoc(`
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
        locales: {
          "zh-CN": termDoc(`
            发消息
            发送消息
            私信
            通知
            提醒
          `),
          ko: termDoc(`
            메시지 보내
            메세지 보내
            쪽지
            디엠
            dm
            알려줘
            전달해
          `),
          es: termDoc(`
            enviar mensaje
            manda mensaje
            mensaje directo
            dm
            notifica
            avisa
          `),
          pt: termDoc(`
            enviar mensagem
            manda mensagem
            mensagem direta
            dm
            notifica
            avisa
          `),
          vi: termDoc(`
            gửi tin nhắn
            gui tin nhan
            nhắn tin
            dm
            thông báo
            nhắc
          `),
          tl: termDoc(`
            magpadala ng mensahe
            padalhan ng mensahe
            dm
            direktang mensahe
            abisuhan
          `),
        },
      },
      weak: {
        base: termDoc(`
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
        locales: {
          "zh-CN": termDoc(`
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
          ko: termDoc(`
            보내
            메시지
            알림
            관리자
            owner
            긴급
            채널
            방
          `),
          es: termDoc(`
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
          pt: termDoc(`
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
          vi: termDoc(`
            gửi
            tin nhắn
            thông báo
            khẩn cấp
            kênh
            phòng
          `),
          tl: termDoc(`
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
      strong: {
        base: termDoc(`
          message admin
          notify owner
          alert admin
          tell admin
          tell owner
          escalate
        `),
        locales: {
          "zh-CN": termDoc(`
            通知管理员
            告诉管理员
            通知 owner
            升级处理
          `),
          ko: termDoc(`
            관리자에게 알려
            관리자한테 말해
            owner에게 알려
            에스컬레이션
          `),
          es: termDoc(`
            avisar al admin
            avisar al owner
            decirle al admin
            escalar
          `),
          pt: termDoc(`
            avisar o admin
            avisar o owner
            falar com o admin
            escalar
          `),
          vi: termDoc(`
            báo admin
            bao admin
            báo owner
            leo thang
          `),
          tl: termDoc(`
            sabihan ang admin
            abisuhan ang owner
            i-escalate
          `),
        },
      },
      weak: {
        base: termDoc(`
          admin
          owner
          notify
          alert
          urgent
          escalate
          important
        `),
        locales: {
          "zh-CN": termDoc(`
            管理员
            owner
            通知
            提醒
            紧急
            升级
            重要
          `),
          ko: termDoc(`
            관리자
            owner
            알림
            긴급
            중요
            에스컬레이션
          `),
          es: termDoc(`
            admin
            owner
            avisar
            alerta
            urgente
            escalar
            importante
          `),
          pt: termDoc(`
            admin
            owner
            avisar
            alerta
            urgente
            escalar
            importante
          `),
          vi: termDoc(`
            admin
            owner
            báo
            khẩn cấp
            quan trọng
          `),
          tl: termDoc(`
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
      strong: {
        base: termDoc(`
          search conversations
          search chats
          search messages
          find messages
          find conversation
        `),
        locales: {
          "zh-CN": termDoc(`
            搜索对话
            搜索聊天
            搜索消息
            查找消息
          `),
          ko: termDoc(`
            대화 검색
            채팅 검색
            메시지 검색
            메시지 찾기
          `),
          es: termDoc(`
            buscar conversaciones
            buscar chats
            buscar mensajes
            encontrar mensajes
          `),
          pt: termDoc(`
            buscar conversas
            buscar chats
            buscar mensagens
            encontrar mensagens
          `),
          vi: termDoc(`
            tìm cuộc trò chuyện
            tìm tin nhắn
            tra cứu cuộc trò chuyện
          `),
          tl: termDoc(`
            hanapin ang usapan
            hanapin ang chat
            hanapin ang mensahe
          `),
        },
      },
      weak: {
        base: termDoc(`
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
        locales: {
          "zh-CN": termDoc(`
            搜索
            查找
            记得
            提到
            聊过
            之前
            对话
          `),
          ko: termDoc(`
            검색
            찾기
            기억
            말했
            언급
            이전
            대화
          `),
          es: termDoc(`
            buscar
            encontrar
            recordar
            dijiste
            mencionaste
            antes
            conversación
            conversacion
          `),
          pt: termDoc(`
            buscar
            encontrar
            lembrar
            falou
            mencionou
            antes
            conversa
          `),
          vi: termDoc(`
            tìm
            nhớ
            nói
            nhắc
            trước đó
            cuộc trò chuyện
          `),
          tl: termDoc(`
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
      strong: {
        base: termDoc(`
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
        locales: {
          "zh-CN": termDoc(`
            读取频道
            查看聊天
            查看消息记录
            频道历史
            聊天记录
          `),
          ko: termDoc(`
            채널 읽기
            채팅 읽기
            메시지 기록
            채널 기록
            채팅 기록
          `),
          es: termDoc(`
            leer canal
            leer chat
            historial del canal
            historial del chat
            registro del chat
          `),
          pt: termDoc(`
            ler canal
            ler chat
            histórico do canal
            histórico do chat
            registro do chat
          `),
          vi: termDoc(`
            đọc kênh
            đọc chat
            lịch sử kênh
            lịch sử chat
          `),
          tl: termDoc(`
            basahin ang channel
            basahin ang chat
            history ng channel
            history ng chat
          `),
        },
      },
      weak: {
        base: termDoc(`
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
        locales: {
          "zh-CN": termDoc(`
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
          ko: termDoc(`
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
          es: termDoc(`
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
          pt: termDoc(`
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
          vi: termDoc(`
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
          tl: termDoc(`
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
      strong: {
        base: termDoc(`
          go live
          go offline
          start stream
          stop stream
          start streaming
          stop streaming
          begin stream
          end stream
        `),
        locales: {
          "zh-CN": termDoc(`
            开播
            下播
            开始直播
            停止直播
          `),
          ko: termDoc(`
            방송 시작
            방송 종료
            라이브 시작
            라이브 종료
          `),
          es: termDoc(`
            salir en vivo
            terminar stream
            iniciar stream
            detener stream
          `),
          pt: termDoc(`
            entrar ao vivo
            encerrar stream
            iniciar stream
            parar stream
          `),
          vi: termDoc(`
            lên sóng
            ket thuc stream
            kết thúc stream
            bắt đầu stream
            bat dau stream
          `),
          tl: termDoc(`
            mag live
            tapusin ang stream
            simulan ang stream
            ihinto ang stream
          `),
        },
      },
      weak: {
        base: termDoc(`
          live
          stream
          streaming
          broadcast
          twitch
          youtube
          offline
          online
        `),
        locales: {
          "zh-CN": termDoc(`
            直播
            开播
            下播
            在线
            离线
            twitch
            youtube
          `),
          ko: termDoc(`
            라이브
            스트림
            스트리밍
            방송
            트위치
            유튜브
            오프라인
            온라인
          `),
          es: termDoc(`
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
          pt: termDoc(`
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
          vi: termDoc(`
            stream
            phát sóng
            phat song
            trực tiếp
            twitch
            youtube
            offline
            online
          `),
          tl: termDoc(`
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
      strong: {
        base: termDoc(`
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
        locales: {
          "zh-CN": termDoc(`
            查找联系人
            查人
            搜索联系人
            谁是
            查看资料
          `),
          ko: termDoc(`
            사람 찾기
            연락처 검색
            사용자 조회
            누구야
            프로필 보기
          `),
          es: termDoc(`
            buscar persona
            encontrar persona
            buscar contactos
            quien es
            quién es
            ver perfil
          `),
          pt: termDoc(`
            buscar pessoa
            encontrar pessoa
            buscar contatos
            quem é
            quem e
            ver perfil
          `),
          vi: termDoc(`
            tìm người
            tìm liên hệ
            tra người dùng
            ai là
            xem hồ sơ
          `),
          tl: termDoc(`
            hanapin ang tao
            hanapin ang contact
            sino si
            tingnan ang profile
          `),
        },
      },
      weak: {
        base: termDoc(`
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
        locales: {
          "zh-CN": termDoc(`
            联系人
            用户
            谁
            档案
            身份
            详情
          `),
          ko: termDoc(`
            사람
            연락처
            사용자
            누구
            프로필
            신원
            정보
          `),
          es: termDoc(`
            persona
            contacto
            usuario
            quien
            quién
            perfil
            identidad
            detalles
          `),
          pt: termDoc(`
            pessoa
            contato
            usuário
            usuario
            quem
            perfil
            identidade
            detalhes
          `),
          vi: termDoc(`
            người
            liên hệ
            người dùng
            ai
            hồ sơ
            danh tính
            chi tiết
          `),
          tl: termDoc(`
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
  },
  provider: {
    recentConversations: {
      relevance: {
        base: termDoc(`
          recent
          conversation
          said
          told
          mentioned
          earlier
          before
          chat
          message
        `),
        locales: {
          "zh-CN": termDoc(`
            最近
            对话
            说过
            提到
            之前
            聊天
            消息
          `),
          ko: termDoc(`
            최근
            대화
            말했
            언급
            이전
            채팅
            메시지
          `),
          es: termDoc(`
            reciente
            conversación
            conversacion
            dijo
            mencionó
            menciono
            antes
            chat
            mensaje
          `),
          pt: termDoc(`
            recente
            conversa
            disse
            mencionou
            antes
            chat
            mensagem
          `),
          vi: termDoc(`
            gần đây
            gan day
            cuộc trò chuyện
            nói
            nhắc
            trước đó
            chat
            tin nhắn
          `),
          tl: termDoc(`
            recent
            usapan
            sinabi
            nabanggit
            dati
            chat
            mensahe
          `),
        },
      },
    },
    relevantConversations: {
      relevance: {
        base: termDoc(`
          search
          find
          remember
          who said
          conversation about
          discussed
          talked about
          mentioned
        `),
        locales: {
          "zh-CN": termDoc(`
            搜索
            查找
            记得
            谁说过
            提到
            聊过
          `),
          ko: termDoc(`
            검색
            찾기
            기억
            누가 말했어
            언급
            이야기했던
          `),
          es: termDoc(`
            buscar
            encontrar
            recordar
            quién dijo
            quien dijo
            hablaron de
            mencionó
            menciono
          `),
          pt: termDoc(`
            buscar
            encontrar
            lembrar
            quem disse
            falaram sobre
            mencionou
          `),
          vi: termDoc(`
            tìm
            nhớ
            ai đã nói
            ai da noi
            nhắc đến
            đã bàn về
            da ban ve
          `),
          tl: termDoc(`
            hanap
            tandaan
            sino ang nagsabi
            pinag-usapan
            nabanggit
          `),
        },
      },
    },
    rolodex: {
      relevance: {
        base: termDoc(`
          who
          contact
          reach
          rolodex
          know
          relationship
          person
          people
          friend
          user
        `),
        locales: {
          "zh-CN": termDoc(`
            谁
            联系人
            联络
            关系
            人
            朋友
            用户
          `),
          ko: termDoc(`
            누구
            연락처
            연락
            관계
            사람
            친구
            사용자
          `),
          es: termDoc(`
            quién
            quien
            contacto
            contactar
            relación
            relacion
            persona
            gente
            amigo
            usuario
          `),
          pt: termDoc(`
            quem
            contato
            contatar
            relação
            relacao
            pessoa
            pessoas
            amigo
            usuário
            usuario
          `),
          vi: termDoc(`
            ai
            liên hệ
            lien he
            mối quan hệ
            moi quan he
            người
            bạn bè
            ban be
            người dùng
            nguoi dung
          `),
          tl: termDoc(`
            sino
            contact
            kontak
            relasyon
            tao
            mga tao
            kaibigan
            user
          `),
        },
      },
    },
    uiCatalog: {
      relevance: {
        base: termDoc(`
          plugin
          plugins
          install
          setup
          set up
          configure
          config
          enable
          disable
          activate
          connect
          integration
          help me
          how do i
          how to
          show me
          dashboard
          form
          table
          chart
          metrics
          ui
          interface
          polymarket
          discord
          openai
          anthropic
          telegram
          twitch
          youtube
          twitter
          api key
          credentials
          secret
        `),
        locales: {
          "zh-CN": termDoc(`
            插件
            安装
            设置
            配置
            启用
            禁用
            激活
            连接
            集成
            帮我
            怎么
            给我看
            仪表盘
            表单
            表格
            图表
            指标
            界面
            api key
            凭证
            密钥
          `),
          ko: termDoc(`
            플러그인
            설치
            설정
            구성
            활성화
            비활성화
            연결
            통합
            도와줘
            어떻게
            보여줘
            대시보드
            폼
            테이블
            차트
            지표
            인터페이스
            api key
            자격 증명
            비밀
          `),
          es: termDoc(`
            plugin
            plugins
            instalar
            configuración
            configuracion
            configurar
            activar
            desactivar
            conectar
            integración
            integracion
            ayúdame
            ayudame
            cómo
            como
            muéstrame
            muestrame
            panel
            formulario
            tabla
            gráfico
            grafico
            métricas
            metricas
            interfaz
            api key
            credenciales
            secreto
          `),
          pt: termDoc(`
            plugin
            plugins
            instalar
            configuração
            configuracao
            configurar
            ativar
            desativar
            conectar
            integração
            integracao
            me ajuda
            como faço
            mostrar
            painel
            formulário
            formulario
            tabela
            gráfico
            grafico
            métricas
            metricas
            interface
            api key
            credenciais
            segredo
          `),
          vi: termDoc(`
            plugin
            cài đặt
            cai dat
            thiết lập
            thiet lap
            cấu hình
            cau hinh
            bật
            bat
            tắt
            tat
            kết nối
            ket noi
            tích hợp
            tich hop
            giúp tôi
            giup toi
            làm sao
            lam sao
            cho tôi xem
            dashboard
            biểu mẫu
            bieu mau
            bảng
            bang
            biểu đồ
            bieu do
            chỉ số
            chi so
            giao diện
            giao dien
            api key
            thông tin xác thực
            thong tin xac thuc
            bí mật
            bi mat
          `),
          tl: termDoc(`
            plugin
            plugins
            i-install
            i-setup
            i-configure
            config
            paganahin
            patayin
            i-connect
            integration
            tulungan mo ako
            paano
            ipakita mo
            dashboard
            form
            table
            chart
            metrics
            interface
            api key
            credentials
            secret
          `),
        },
      },
    },
  },
  action: {
    restart: {
      request: {
        base: termDoc(`
          restart
          reboot
          reload
          refresh
          respawn
        `),
        locales: {
          "zh-CN": termDoc(`
            重启
            重开
            重新加载
            刷新
          `),
          ko: termDoc(`
            재시작
            다시 시작
            재부팅
            다시 불러와
            새로고침
          `),
          es: termDoc(`
            reinicia
            reiniciar
            reinicio
            recarga
            recargar
            refresca
            refrescar
          `),
          pt: termDoc(`
            reinicia
            reiniciar
            reinício
            reinicio
            recarrega
            recarregar
            atualiza
            atualizar
          `),
          vi: termDoc(`
            khởi động lại
            khoi dong lai
            tải lại
            tai lai
            làm mới
            lam moi
          `),
          tl: termDoc(`
            i-restart
            restart
            i-reboot
            i-reload
            i-refresh
          `),
        },
      },
    },
    setUserName: {
      recentContext: {
        base: termDoc(`
          name
          my name is
          my name
          i'm
          i am
          call me
          call me by
          change my name
          rename me
        `),
        locales: {
          "zh-CN": termDoc(`
            名字
            我的名字
            我叫
            我是
            叫我
            称呼我
            改名字
          `),
          ko: termDoc(`
            이름
            내 이름
            제 이름은
            나는
            불러줘
            라고 불러
            이름 바꿔
          `),
          es: termDoc(`
            nombre
            mi nombre
            mi nombre es
            me llamo
            llámame
            llamame
            cambia mi nombre
          `),
          pt: termDoc(`
            nome
            meu nome
            meu nome é
            meu nome e
            me chamo
            me chama de
            chame-me
            muda meu nome
          `),
          vi: termDoc(`
            tên
            ten
            tên tôi
            ten toi
            tôi là
            toi la
            gọi tôi là
            goi toi la
            đổi tên tôi
            doi ten toi
          `),
          tl: termDoc(`
            pangalan
            ang pangalan ko
            ako si
            tawagin mo akong
            palitan ang pangalan ko
          `),
        },
      },
    },
    appControl: {
      launchVerb: {
        base: termDoc(`
          launch
          open
          start
          run
          show
        `),
        locales: {
          "zh-CN": termDoc(`
            启动
            打开
            运行
            开启
            显示
          `),
          ko: termDoc(`
            실행
            열어
            시작
            켜
            보여줘
          `),
          es: termDoc(`
            abre
            abrir
            inicia
            iniciar
            ejecuta
            mostrar
          `),
          pt: termDoc(`
            abre
            abrir
            inicia
            iniciar
            executa
            mostrar
          `),
          vi: termDoc(`
            mở
            mo
            khởi chạy
            khoi chay
            chạy
            chay
            bắt đầu
            bat dau
          `),
          tl: termDoc(`
            buksan
            simulan
            patakbuhin
            ipakita
          `),
        },
      },
      stopVerb: {
        base: termDoc(`
          stop
          close
          shut down
          kill
          quit
          exit
        `),
        locales: {
          "zh-CN": termDoc(`
            停止
            关闭
            关掉
            退出
          `),
          ko: termDoc(`
            중지
            멈춰
            종료
            닫아
            끄기
          `),
          es: termDoc(`
            detén
            detener
            cierra
            cerrar
            apaga
            salir
          `),
          pt: termDoc(`
            parar
            pare
            fechar
            fecha
            desliga
            sair
          `),
          vi: termDoc(`
            dừng
            dung
            tắt
            tat
            đóng
            dong
            thoát
            thoat
          `),
          tl: termDoc(`
            ihinto
            itigil
            isara
            patayin
            lumabas
          `),
        },
      },
      genericTarget: {
        base: termDoc(`
          app
          application
        `),
        locales: {
          "zh-CN": termDoc(`
            应用
            应用程序
            程序
          `),
          ko: termDoc(`
            앱
            애플리케이션
          `),
          es: termDoc(`
            app
            aplicación
            aplicacion
            programa
          `),
          pt: termDoc(`
            app
            aplicativo
            aplicação
            aplicacao
            programa
          `),
          vi: termDoc(`
            ứng dụng
            ung dung
          `),
          tl: termDoc(`
            app
            aplikasyon
            programa
          `),
        },
      },
      knownApp: {
        base: termDoc(`
          shopify
          vincent
          companion
          hyperscape
          babylon
        `),
      },
    },
    terminal: {
      commandVerb: {
        base: termDoc(`
          run
          execute
          start
          do
        `),
        locales: {
          "zh-CN": termDoc(`
            运行
            执行
            开始
          `),
          ko: termDoc(`
            실행
            돌려
            시작
            해줘
          `),
          es: termDoc(`
            ejecuta
            ejecutar
            corre
            correr
            inicia
          `),
          pt: termDoc(`
            executa
            executar
            roda
            rodar
            inicia
          `),
          vi: termDoc(`
            chạy
            chay
            thực hiện
            thuc hien
            bắt đầu
            bat dau
          `),
          tl: termDoc(`
            patakbuhin
            isagawa
            simulan
            gawin
          `),
        },
      },
      commandFiller: {
        base: termDoc(`
          command
          shell command
          terminal command
        `),
        locales: {
          "zh-CN": termDoc(`
            命令
            终端命令
            shell 命令
          `),
          ko: termDoc(`
            명령
            명령어
            터미널 명령
          `),
          es: termDoc(`
            comando
            comando de terminal
          `),
          pt: termDoc(`
            comando
            comando do terminal
          `),
          vi: termDoc(`
            lệnh
            lenh
            lệnh terminal
            lenh terminal
          `),
          tl: termDoc(`
            utos
            command
            utos sa terminal
          `),
        },
      },
      utility: {
        base: termDoc(`
          price
          worth
          cost
          balance
          status
          check
          curl
          fetch
          tail
          head
          log
        `),
        locales: {
          "zh-CN": termDoc(`
            价格
            余额
            状态
            检查
            日志
          `),
          ko: termDoc(`
            가격
            잔액
            상태
            확인
            로그
          `),
          es: termDoc(`
            precio
            costo
            balance
            saldo
            estado
            revisar
            log
          `),
          pt: termDoc(`
            preço
            preco
            custo
            saldo
            estado
            verificar
            log
          `),
          vi: termDoc(`
            giá
            gia
            số dư
            so du
            trạng thái
            trang thai
            kiểm tra
            kiem tra
            log
          `),
          tl: termDoc(`
            presyo
            balanse
            status
            check
            log
          `),
        },
      },
      cryptoBitcoin: {
        base: termDoc(`
          bitcoin
          btc
        `),
        locales: {
          "zh-CN": termDoc(`
            比特币
          `),
          ko: termDoc(`
            비트코인
          `),
        },
      },
      cryptoEthereum: {
        base: termDoc(`
          ethereum
          eth
        `),
        locales: {
          "zh-CN": termDoc(`
            以太坊
          `),
          ko: termDoc(`
            이더리움
          `),
        },
      },
      cryptoSolana: {
        base: termDoc(`
          solana
          sol
        `),
        locales: {
          "zh-CN": termDoc(`
            索拉纳
          `),
          ko: termDoc(`
            솔라나
          `),
        },
      },
      disk: {
        base: termDoc(`
          disk
          space
          storage
          disk usage
        `),
        locales: {
          "zh-CN": termDoc(`
            磁盘
            空间
            存储
          `),
          ko: termDoc(`
            디스크
            저장공간
            저장소
          `),
          es: termDoc(`
            disco
            espacio
            almacenamiento
          `),
          pt: termDoc(`
            disco
            espaço
            espaco
            armazenamento
          `),
          vi: termDoc(`
            ổ đĩa
            o dia
            dung lượng
            dung luong
            lưu trữ
            luu tru
          `),
          tl: termDoc(`
            disk
            espasyo
            storage
          `),
        },
      },
      uptime: {
        base: termDoc(`
          uptime
          load
        `),
        locales: {
          "zh-CN": termDoc(`
            运行时间
            负载
          `),
          ko: termDoc(`
            업타임
            부하
          `),
          es: termDoc(`
            tiempo activo
            carga
          `),
          pt: termDoc(`
            uptime
            tempo ativo
            carga
          `),
          vi: termDoc(`
            thời gian hoạt động
            thoi gian hoat dong
            tải
            tai
          `),
          tl: termDoc(`
            uptime
            load
          `),
        },
      },
      memory: {
        base: termDoc(`
          memory
          ram
        `),
        locales: {
          "zh-CN": termDoc(`
            内存
          `),
          ko: termDoc(`
            메모리
            램
          `),
          es: termDoc(`
            memoria
            ram
          `),
          pt: termDoc(`
            memória
            memoria
            ram
          `),
          vi: termDoc(`
            bộ nhớ
            bo nho
            ram
          `),
          tl: termDoc(`
            memory
            ram
          `),
        },
      },
      process: {
        base: termDoc(`
          process
          processes
          top
          memory usage
        `),
        locales: {
          "zh-CN": termDoc(`
            进程
            进程列表
            内存占用
          `),
          ko: termDoc(`
            프로세스
            top
            메모리 사용
          `),
          es: termDoc(`
            proceso
            procesos
            top
            uso de memoria
          `),
          pt: termDoc(`
            processo
            processos
            top
            uso de memória
            uso de memoria
          `),
          vi: termDoc(`
            tiến trình
            tien trinh
            top
            dùng bộ nhớ
            dung bo nho
          `),
          tl: termDoc(`
            process
            mga proseso
            top
            gamit ng memory
          `),
        },
      },
    },
    logLevel: {
      command: {
        base: termDoc(`
          /loglevel
          log level
          logging level
        `),
        locales: {
          "zh-CN": termDoc(`
            日志级别
            日志等级
          `),
          ko: termDoc(`
            로그 레벨
            로깅 레벨
          `),
          es: termDoc(`
            nivel de log
            nivel de registro
          `),
          pt: termDoc(`
            nível de log
            nivel de log
            nível de registro
            nivel de registro
          `),
          vi: termDoc(`
            mức log
            muc log
            mức ghi log
            muc ghi log
          `),
          tl: termDoc(`
            antas ng log
            antas ng pag-log
          `),
        },
      },
      setVerb: {
        base: termDoc(`
          set
          change
          switch
        `),
        locales: {
          "zh-CN": termDoc(`
            设置
            调成
            改成
            切换
          `),
          ko: termDoc(`
            설정
            바꿔
            변경
            전환
          `),
          es: termDoc(`
            pon
            poner
            cambia
            cambiar
            ajusta
          `),
          pt: termDoc(`
            define
            definir
            muda
            mudar
            ajusta
          `),
          vi: termDoc(`
            đặt
            dat
            đổi
            doi
            chuyển
            chuyen
          `),
          tl: termDoc(`
            itakda
            palitan
            ilipat
          `),
        },
      },
      domain: {
        base: termDoc(`
          log
          logging
          verbosity
        `),
        locales: {
          "zh-CN": termDoc(`
            日志
            详细程度
          `),
          ko: termDoc(`
            로그
            로깅
            상세도
          `),
          es: termDoc(`
            log
            registro
            verbosidad
          `),
          pt: termDoc(`
            log
            registro
            verbosidade
          `),
          vi: termDoc(`
            log
            ghi log
            độ chi tiết
            do chi tiet
          `),
          tl: termDoc(`
            log
            pag-log
            verbosity
          `),
        },
      },
      level: {
        trace: {
          base: termDoc(`
            trace
          `),
          locales: {
            "zh-CN": termDoc(`
              跟踪
            `),
            ko: termDoc(`
              추적
            `),
            es: termDoc(`
              rastreo
            `),
            pt: termDoc(`
              rastreamento
            `),
            vi: termDoc(`
              theo dõi
              theo doi
            `),
          },
        },
        debug: {
          base: termDoc(`
            debug
          `),
          locales: {
            "zh-CN": termDoc(`
              调试
            `),
            ko: termDoc(`
              디버그
            `),
            es: termDoc(`
              depuración
              depuracion
            `),
            pt: termDoc(`
              depuração
              depuracao
            `),
            vi: termDoc(`
              gỡ lỗi
              go loi
            `),
          },
        },
        info: {
          base: termDoc(`
            info
            information
          `),
          locales: {
            "zh-CN": termDoc(`
              信息
            `),
            ko: termDoc(`
              정보
            `),
            es: termDoc(`
              información
              informacion
            `),
            pt: termDoc(`
              informação
              informacao
            `),
            vi: termDoc(`
              thông tin
              thong tin
            `),
            tl: termDoc(`
              impormasyon
            `),
          },
        },
        warn: {
          base: termDoc(`
            warn
            warning
          `),
          locales: {
            "zh-CN": termDoc(`
              警告
            `),
            ko: termDoc(`
              경고
            `),
            es: termDoc(`
              advertencia
            `),
            pt: termDoc(`
              aviso
              advertência
              advertencia
            `),
            vi: termDoc(`
              cảnh báo
              canh bao
            `),
            tl: termDoc(`
              babala
            `),
          },
        },
        error: {
          base: termDoc(`
            error
            errors
          `),
          locales: {
            "zh-CN": termDoc(`
              错误
            `),
            ko: termDoc(`
              오류
            `),
            pt: termDoc(`
              erro
            `),
            vi: termDoc(`
              lỗi
              loi
            `),
          },
        },
      },
    },
    updateRole: {
      intent: {
        base: termDoc(`
          role
          assign role
          set role
          change role
          update role
          boss
          manager
          supervisor
          superior
          lead
          coworker
          co-worker
          teammate
          colleague
          peer
          friend
          partner
          admin
          owner
          guest
          member
          user
          mod
          moderator
          promote
          demote
          revoke
          remove role
        `),
        locales: {
          "zh-CN": termDoc(`
            角色
            分配角色
            设置角色
            修改角色
            老板
            经理
            主管
            上级
            负责人
            同事
            队友
            伙伴
            管理员
            所有者
            主人
            访客
            成员
            用户
            版主
            提升
            升级
            降级
            撤销
            移除角色
          `),
          ko: termDoc(`
            역할
            역할 설정
            역할 변경
            상사
            매니저
            관리자
            감독자
            리더
            동료
            팀원
            친구
            파트너
            오너
            소유자
            게스트
            멤버
            사용자
            모더레이터
            승급
            강등
            철회
          `),
          es: termDoc(`
            rol
            asigna el rol
            cambiar el rol
            jefe
            jefa
            gerente
            supervisor
            líder
            lider
            compañero
            companero
            colega
            amigo
            socio
            administrador
            dueño
            dueno
            propietario
            invitado
            miembro
            usuario
            moderador
            asciende
            promociona
            degrada
            revoca
            quitar el rol
          `),
          pt: termDoc(`
            papel
            função
            funcao
            cargo
            atribuir papel
            mudar papel
            chefe
            gerente
            supervisor
            líder
            lider
            colega
            amigo
            parceiro
            administrador
            dono
            proprietário
            proprietario
            convidado
            membro
            usuário
            usuario
            moderador
            promover
            rebaixar
            revogar
            remover papel
          `),
          vi: termDoc(`
            vai trò
            vai tro
            gán vai trò
            gan vai tro
            đổi vai trò
            doi vai tro
            sếp
            sep
            quản lý
            quan ly
            giám sát
            giam sat
            trưởng nhóm
            truong nhom
            đồng nghiệp
            dong nghiep
            bạn bè
            ban be
            đối tác
            doi tac
            quản trị viên
            quan tri vien
            chủ sở hữu
            chu so huu
            khách
            thành viên
            thanh vien
            người dùng
            nguoi dung
            điều hành viên
            dieu hanh vien
            thăng cấp
            thang cap
            hạ cấp
            ha cap
            thu hồi
            thu hoi
          `),
          tl: termDoc(`
            role
            tungkulin
            itakda ang role
            baguhin ang role
            boss
            manager
            supervisor
            lead
            katrabaho
            kasamahan
            kaibigan
            partner
            admin
            may-ari
            guest
            miyembro
            user
            mod
            moderador
            i-promote
            i-demote
            bawiin
            alisin ang role
          `),
        },
      },
    },
    triggerCreate: {
      request: {
        base: termDoc(`
          schedule
          scheduled
          trigger
          heartbeat
          cron
          recurring
          recur
          repeat
          repeating
          reminder
          remind
          automate
          automation
          automatic
          periodic
          interval
          follow up
          check in
          every day
          every week
          every month
          every hour
          daily
          weekly
          monthly
          hourly
          alarm
          wake me
        `),
        locales: {
          "zh-CN": termDoc(`
            安排
            定时
            触发器
            心跳
            cron
            循环
            重复
            提醒
            提醒我
            自动化
            自动
            定期
            间隔
            跟进
            检查一下
            每天
            每周
            每月
            每小时
            闹钟
            叫醒我
          `),
          ko: termDoc(`
            예약
            예약해
            트리거
            하트비트
            크론
            반복
            반복적으로
            알림
            리마인더
            자동화
            자동
            주기적
            간격
            후속 확인
            매일
            매주
            매달
            매시간
            알람
            깨워줘
          `),
          es: termDoc(`
            programa
            programar
            recordatorio
            recordar
            recurrente
            repetir
            automatiza
            automatizar
            automático
            automatico
            periódico
            periodico
            intervalo
            seguimiento
            cada día
            cada dia
            cada semana
            cada mes
            cada hora
            diario
            semanal
            mensual
            alarma
            despiértame
            despiertame
          `),
          pt: termDoc(`
            programa
            programar
            lembrete
            lembrar
            recorrente
            repetir
            automatiza
            automatizar
            automático
            automatico
            periódico
            periodico
            intervalo
            acompanhamento
            cada dia
            cada semana
            cada mês
            cada mes
            cada hora
            diário
            diario
            semanal
            mensal
            alarme
            me acorde
          `),
          vi: termDoc(`
            lên lịch
            len lich
            lời nhắc
            loi nhac
            nhắc tôi
            nhac toi
            lặp lại
            lap lai
            tự động
            tu dong
            tự động hóa
            tu dong hoa
            định kỳ
            dinh ky
            khoảng cách
            khoang cach
            theo dõi
            theo doi
            mỗi ngày
            moi ngay
            mỗi tuần
            moi tuan
            mỗi tháng
            moi thang
            mỗi giờ
            moi gio
            báo thức
            bao thuc
            đánh thức tôi
            danh thuc toi
          `),
          tl: termDoc(`
            iskedyul
            paalala
            ipaalala
            paulit-ulit
            ulitin
            awtomatiko
            awtomasyon
            pana-panahon
            pagitan
            follow up
            kada araw
            kada linggo
            kada buwan
            kada oras
            alarm
            gisingin mo ako
          `),
        },
      },
    },
  },
} as const satisfies ValidationKeywordTree;

function isValidationKeywordDoc(value: unknown): value is ValidationKeywordDoc {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return "base" in record || "locales" in record;
}

function lookupValidationKeywordDoc(key: string): ValidationKeywordDoc {
  let current: unknown = VALIDATION_KEYWORD_DOCS;
  for (const segment of key.split(".")) {
    if (!current || typeof current !== "object") {
      throw new Error(`Unknown validation keyword key: ${key}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (!isValidationKeywordDoc(current)) {
    throw new Error(`Unknown validation keyword key: ${key}`);
  }

  return current;
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeKeywordMatchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function usesAsciiWordBoundaries(term: string): boolean {
  return /^[a-z0-9][a-z0-9' -]*$/i.test(term);
}

export function splitKeywordDoc(value: string | undefined): string[] {
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
    const key = normalizeKeywordMatchText(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    terms.push(trimmed);
  }
  return terms;
}

export function textIncludesKeywordTerm(text: string, term: string): boolean {
  const normalizedText = normalizeKeywordMatchText(text);
  const normalizedTerm = normalizeKeywordMatchText(term);
  if (!normalizedText || !normalizedTerm) {
    return false;
  }

  if (usesAsciiWordBoundaries(normalizedTerm)) {
    const pattern = new RegExp(
      `\\b${escapePattern(normalizedTerm).replace(/\\ /g, "\\s+")}\\b`,
      "i",
    );
    if (pattern.test(text)) {
      return true;
    }

    const hasNonAsciiText = [...text].some((char) => char.charCodeAt(0) > 0x7f);
    if (hasNonAsciiText) {
      return normalizedText.includes(normalizedTerm);
    }
    return false;
  }

  return normalizedText.includes(normalizedTerm);
}

export function collectKeywordTermMatches(
  texts: readonly string[],
  terms: readonly string[],
): Set<string> {
  const matches = new Set<string>();
  for (const text of texts) {
    for (const term of terms) {
      if (textIncludesKeywordTerm(text, term)) {
        matches.add(term);
      }
    }
  }
  return matches;
}

export function findKeywordTermMatch(
  text: string,
  terms: readonly string[],
): string | undefined {
  const sorted = [...terms].sort((left, right) => right.length - left.length);
  return sorted.find((term) => textIncludesKeywordTerm(text, term));
}

export function getValidationKeywordTerms(
  key: string,
  options?: {
    includeAllLocales?: boolean;
    locale?: unknown;
  },
): string[] {
  const doc = lookupValidationKeywordDoc(key);
  if (options?.includeAllLocales) {
    return splitKeywordDoc(
      [doc.base, ...Object.values(doc.locales ?? {})]
        .filter((value): value is string => typeof value === "string")
        .join("\n"),
    );
  }

  const locale = normalizeCharacterLanguage(options?.locale);
  return splitKeywordDoc(`${doc.base ?? ""}\n${doc.locales?.[locale] ?? ""}`);
}

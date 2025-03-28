const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// ================= CONFIGURAÇÕES =================
const prefixo = '!';
const ADMINS = ['558882204383@c.us', '558881769095@c.us'];
const REGRAS_GRUPO = `
🔹 𝐅𝐄𝐈𝐑Ã𝐎 𝐈𝐂𝐀𝐏𝐔Í - 𝐂𝐎𝐌𝐏𝐑𝐀 & 𝐕𝐄𝐍𝐃𝐀 🔹

📢 Bem-vindo(a)! Aqui você pode comprar, vender e divulgar seus produtos de forma rápida e segura.

⚠️ 𝐑𝐄𝐆𝐑𝐀𝐒 𝐆𝐄𝐑𝐀𝐈𝐒

✅ Respeite todos os membros.
✅ Seja claro nas descrições dos produtos.
✅ Negocie de forma honesta e responsável.

🚫 𝐏𝐑𝐎𝐈𝐁𝐈𝐃𝐎:

⛔ Publicações fora do tema de vendas.
⛔ Conteúdo ofensivo ou desrespeitoso.
⛔ Divulgação de links suspeitos, apostas ou jogos de azar.
⛔ Fake news ou informações não verificadas.
⛔ Spam, golpes ou perfis falsos.

💬 𝐃𝐔́𝐕𝐈𝐃𝐀𝐒?
Entre em contato com a administração do grupo.

📌 Boas vendas e bons negócios!
`;

// Banco de dados simples em memória
const warnCount = {};
const banCount = {};
const anuncios = [];

// ================= INICIALIZAÇÃO DO CLIENTE =================
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, 'session_data'),
    clientId: 'feirao-icapui-bot'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  }
});

// ================= MANEJO DE SESSÃO =================
const SESSION_FILE = path.join(__dirname, 'session.json');

function saveSession(session) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session));
}

function loadSession() {
  return fs.existsSync(SESSION_FILE) ? JSON.parse(fs.readFileSync(SESSION_FILE)) : null;
}

// ================= EVENTOS DO CLIENTE =================
client.on('qr', qr => {
  console.log('📲 QR Code para autenticação:');
  qrcode.generate(qr, { small: true });
  
  // Alternativa para ambientes remotos
  console.log('\n🔗 Ou acesse este link para escanear:');
  console.log(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`);
});

client.on('authenticated', (session) => {
  console.log('✅ Autenticado com sucesso!');
  saveSession(session);
});

client.on('auth_failure', msg => {
  console.error('❌ Falha na autenticação:', msg);
});

client.on('ready', () => {
  console.log('🤖 Bot pronto para operar!');
  // Limpa QR code temporário se existir
  if (fs.existsSync('temp_qr.png')) {
    fs.unlinkSync('temp_qr.png');
  }
});

client.on('disconnected', (reason) => {
  console.log('❌ Bot desconectado:', reason);
});

// ================= EVENTO DE ENTRADA NO GRUPO =================
client.on('group_join', async (notification) => {
  try {
    const chat = await client.getChatById(notification.chatId);
    const contact = await client.getContactById(notification.recipientIds[0]);
    
    let welcomeMsg = `👋 Olá *${contact.pushname || contact.number}*, bem-vindo(a) ao grupo *${chat.name}*!\n\n`;
    welcomeMsg += REGRAS_GRUPO;

    try {
      const profilePic = await contact.getProfilePicUrl();
      if (profilePic) {
        const media = await MessageMedia.fromUrl(profilePic);
        await client.sendMessage(chat.id._serialized, media, { caption: welcomeMsg });
      } else {
        await client.sendMessage(chat.id._serialized, welcomeMsg);
      }
    } catch (e) {
      await client.sendMessage(chat.id._serialized, welcomeMsg);
    }

    // Envia regras no privado
    try {
      await client.sendMessage(notification.recipientIds[0], `📝 *Regras do grupo ${chat.name}:*\n\n${REGRAS_GRUPO}`);
    } catch (e) {
      console.log('Não foi possível enviar mensagem privada', e);
    }
  } catch (error) {
    console.error('Erro no evento group_join:', error);
  }
});

// ================= PROCESSADOR DE MENSAGENS =================
client.on('message', async (msg) => {
  if (msg.fromMe || msg.isStatus) return;
  const isAdmin = ADMINS.includes(msg.author || msg.from);
  const isGroup = msg.from.endsWith('@g.us');
  const command = msg.body.split(' ')[0].toLowerCase();
  const args = msg.body.split(' ').slice(1);

  // ================= ANTI-LINK =================
  if (isGroup && !isAdmin && (msg.body.match(/https?:\/\/|www\.|wa\.me\/|bit\.ly|tinyurl\.com/gi))) {
    try {
      await msg.delete(true);
      const user = msg.author || msg.from;
      
      warnCount[user] = (warnCount[user] || 0) + 1;
      const chances = 3 - warnCount[user];

      const chat = await msg.getChat();
      const warningMsg = warnCount[user] >= 3 ? 
        `⛔ @${user.split('@')[0]} foi banido por enviar links!` :
        `@${user.split('@')[0]} ⚠️ Links proibidos! (${warnCount[user]}/3) ${chances > 0 ? `\nChances restantes: ${chances}` : ''}`;

      await chat.sendMessage(warningMsg, { mentions: [user] });

      if (warnCount[user] >= 3) {
        await chat.removeParticipants([user]);
        delete warnCount[user];
      }
    } catch (error) {
      console.error('Erro no anti-link:', error);
    }
    return;
  }

  // ================= COMANDOS DE ADMIN =================
  if (isAdmin) {
    switch (command) {
      case `${prefixo}ban`:
        try {
          let userToBan;
          const chat = await msg.getChat();
          
          if (msg.mentionedIds?.length > 0) {
            userToBan = msg.mentionedIds[0];
          } else if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            userToBan = quotedMsg.author;
          }

          if (!userToBan) {
            await msg.reply('❌ Marque alguém ou responda uma mensagem com !ban');
            return;
          }

          if (ADMINS.includes(userToBan)) {
            await msg.reply('❌ Não posso banir outros administradores!');
            return;
          }

          await chat.sendMessage(`@${userToBan.split('@')[0]} 🚨 Você será banido!`, { mentions: [userToBan] });
          await new Promise(resolve => setTimeout(resolve, 3000));
          await chat.removeParticipants([userToBan]);
          await chat.sendMessage(`⛔ @${userToBan.split('@')[0]} foi banido!`, { mentions: [userToBan] });

          // Registra o ban
          const today = new Date().toLocaleDateString();
          banCount[today] = (banCount[today] || 0) + 1;
        } catch (error) {
          console.error('Erro no !ban:', error);
          await msg.reply('❌ Erro ao banir usuário');
        }
        break;

      case `${prefixo}add`:
        try {
          if (!args[0]) {
            await msg.reply('⚠️ Use: !add 558899999999');
            return;
          }
          
          const number = args[0].replace(/\D/g, '') + '@c.us';
          const chat = await msg.getChat();
          await chat.addParticipants([number]);
          await msg.reply(`✅ ${number} adicionado com sucesso!`);
        } catch (error) {
          console.error('Erro no !add:', error);
          await msg.reply('❌ Erro ao adicionar usuário');
        }
        break;

      case `${prefixo}delete`:
        try {
          if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            await quotedMsg.delete(true);
            await msg.delete(true);
          } else {
            await msg.reply('❌ Responda a mensagem que deseja apagar');
          }
        } catch (error) {
          console.error('Erro no !delete:', error);
          await msg.reply('❌ Erro ao apagar mensagem');
        }
        break;

      case `${prefixo}fechar`:
        try {
          const chat = await msg.getChat();
          await chat.setMessagesAdminsOnly(true);
          await msg.reply('🔒 Grupo fechado! Apenas admins podem enviar mensagens.');
        } catch (error) {
          console.error('Erro no !fechar:', error);
          await msg.reply('❌ Erro ao fechar grupo');
        }
        break;

      case `${prefixo}abrir`:
        try {
          const chat = await msg.getChat();
          await chat.setMessagesAdminsOnly(false);
          await msg.reply('🔓 Grupo aberto! Todos podem enviar mensagens.');
        } catch (error) {
          console.error('Erro no !abrir:', error);
          await msg.reply('❌ Erro ao abrir grupo');
        }
        break;
    }
  }

  // ================= COMANDOS PÚBLICOS =================
  switch (command) {
    case `${prefixo}link`:
      try {
        const chat = await msg.getChat();
        const inviteCode = await chat.getInviteCode();
        await msg.reply(`🔗 Link do grupo: https://chat.whatsapp.com/${inviteCode}`);
      } catch (error) {
        console.error('Erro no !link:', error);
        await msg.reply('❌ Erro ao gerar link');
      }
      break;

    case `${prefixo}anunciar`:
      try {
        const anuncioText = args.join(' ');
        const [produto, preco, ...descricao] = anuncioText.split(' - ');
        
        if (!produto || !preco) {
          await msg.reply('⚠️ Formato: !anunciar Produto - Preço - Descrição');
          return;
        }

        const vendedor = msg.author || msg.from;
        const anuncio = {
          produto,
          preco,
          descricao: descricao.join(' ') || 'Sem descrição',
          vendedor,
          data: new Date().toLocaleString()
        };
        
        anuncios.push(anuncio);
        
        const resposta = `
📢 *NOVO ANÚNCIO* 📢
🛒 *Produto*: ${produto}
💰 *Preço*: ${preco}
📝 *Descrição*: ${descricao.join(' ') || "Sem detalhes."}
👤 *Vendedor*: @${vendedor.split('@')[0]}
⏰ *Data*: ${new Date().toLocaleString()}
        `.trim();

        await msg.reply(resposta);
      } catch (error) {
        console.error('Erro no !anunciar:', error);
        await msg.reply('❌ Erro ao criar anúncio');
      }
      break;

    case `${prefixo}sticker`:
    case `${prefixo}figurinha`:
    case `${prefixo}s`:
      try {
        let media;
        
        if (msg.hasQuotedMsg) {
          const quotedMsg = await msg.getQuotedMessage();
          if (quotedMsg.hasMedia) {
            media = await quotedMsg.downloadMedia();
          }
        } else if (msg.hasMedia) {
          media = await msg.downloadMedia();
        }

        if (media) {
          await client.sendMessage(msg.from, media, {
            sendMediaAsSticker: true,
            stickerName: 'Feirão Icatu',
            stickerAuthor: 'Bot Oficial'
          });
        } else {
          await msg.reply('❌ Envie ou responda uma imagem/vídeo');
        }
      } catch (error) {
        console.error('Erro no !sticker:', error);
        await msg.reply('❌ Erro ao criar figurinha');
      }
      break;

    case `${prefixo}menu`:
      const menu = `
📜 *MENU DE COMANDOS* 📜

🛒 *Anúncios*
!anunciar Produto - Preço - Descrição

🎭 *Figurinhas*
!sticker (responda a imagem/vídeo)

🔗 *Utilitários*
!link - Mostra link do grupo

${isAdmin ? `
👑 *ADMIN*
!ban [@mencione] - Banir usuário
!add 558899999999 - Adicionar ao grupo
!delete [responda] - Apagar mensagem
!fechar - Restringir para admins
!abrir - Liberar para todos
` : ''}
      `.trim();
      await msg.reply(menu);
      break;

    case `${prefixo}ajuda`:
      await msg.reply('📝 Digite *!menu* para ver todos os comandos');
      break;
  }
});

// ================= INICIALIZAÇÃO =================
client.initialize();

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
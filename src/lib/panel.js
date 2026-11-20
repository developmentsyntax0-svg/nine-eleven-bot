import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import path from 'node:path';
import { env } from '../config/env.js';
import { theme } from '../config/theme.js';

export const logoPath = path.join(env.rootDir, 'assets', 'logo.png');

const WHITE = 0xffffff;
const INK = 0x0b0b0f;

function validate(components) {
  let count = 0;
  let textLength = 0;
  const visit = (node) => {
    count += 1;
    if (node.type === 10) textLength += node.content?.length ?? 0;
    node.components?.forEach(visit);
    if (node.accessory) visit(node.accessory);
  };
  components.forEach(visit);
  if (count > 40) throw new RangeError('Panel exceeds 40 components.');
  if (textLength > 4000) throw new RangeError('Panel exceeds 4000 text characters.');
}

export function panel({
  title,
  body,
  accentColor = WHITE,
  buttons = [],
  gallery = [],
  feature,
  footer,
  thumbnail = true,
}) {
  const container = new ContainerBuilder().setAccentColor(accentColor);

  if (thumbnail) {
    const header = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${theme.brand.name} — ${title}`))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('attachment://logo.png').setDescription(theme.brand.name));
    container.addSectionComponents(header);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

  if (feature) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(feature.title))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(feature.url).setDescription(feature.description ?? feature.title),
        ),
    );
  }

  const files = thumbnail ? [new AttachmentBuilder(logoPath, { name: 'logo.png' })] : [];
  const names = new Set(['logo.png']);

  if (gallery.length) {
    const media = new MediaGalleryBuilder();
    for (const item of gallery.slice(0, 9)) {
      if (names.has(item.name)) continue;
      names.add(item.name);
      files.push(new AttachmentBuilder(item.path, { name: item.name }));
      media.addItems(new MediaGalleryItemBuilder().setURL(`attachment://${item.name}`).setDescription(item.description));
    }
    container.addMediaGalleryComponents(media);
  }

  if (buttons.length) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(buttons.slice(0, 5)),
    );
  }

  if (footer !== false) {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer ?? theme.footer}`));
  }

  validate([container.toJSON()]);
  return { components: [container], files, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

export function linkButton(label, url, emoji) {
  const button = new ButtonBuilder().setStyle(5).setLabel(label).setURL(url);
  if (emoji) button.setEmoji(emoji);
  return button;
}

export { WHITE, INK };

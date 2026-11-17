import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const outDir = path.join(process.cwd(), 'tests', 'fixtures');
fs.mkdirSync(outDir, { recursive: true });

const card = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  name: '测试角色·阿绫',
  description: '阿绫是旧钟楼的守夜人，{{char}}总能听见钟声里的秘密。',
  personality: '温柔、警觉、说话轻声细语。',
  scenario: '海边的旧城，午夜钟声即将敲响。',
  first_mes:
    '*阿绫提着灯从钟楼的阴影里走出来，灯光落在你的鞋尖上。*\n\n「你来了。今晚的钟，好像比往常慢了一拍。」',
  mes_example:
    '<START>\n{{user}}: 钟楼里有什么？\n{{char}}: *她把灯举高了一些。*「一些不该被忘记的名字。」',
  data: {
    name: '测试角色·阿绫',
    description: '阿绫是旧钟楼的守夜人，{{char}}总能听见钟声里的秘密。',
    personality: '温柔、警觉、说话轻声细语。',
    scenario: '海边的旧城，午夜钟声即将敲响。',
    first_mes:
      '*阿绫提着灯从钟楼的阴影里走出来，灯光落在你的鞋尖上。*\n\n「你来了。今晚的钟，好像比往常慢了一拍。」',
    mes_example:
      '<START>\n{{user}}: 钟楼里有什么？\n{{char}}: *她把灯举高了一些。*「一些不该被忘记的名字。」',
    alternate_greetings: [
      '*雨声里，阿绫站在钟楼门口，肩上落着水珠。*「进来躲雨吧，钟声还要一会儿。」',
    ],
    tags: ['测试', '悬疑'],
    creator: 'LiteTavern Test',
    character_version: '1.0',
    extensions: { world: '测试世界书' },
    character_book: {
      name: '测试世界书',
      entries: [
        {
          keys: [],
          content: '【世界常驻】海边的旧城终年被雾包围，午夜钟声响起时，所有钟表都会停摆一分钟。',
          comment: '世界核心',
          constant: true,
          position: 'before_char',
          extensions: { position: 0 },
        },
        {
          keys: ['钟楼', '钟声'],
          content:
            '【钟楼】钟楼地下有一间上锁的档案室，钥匙挂在阿绫的腰间。档案室里保存着旧城所有失踪者的名字。',
          comment: '钟楼与档案室',
          constant: false,
          selective: false,
          position: 'after_char',
          extensions: { position: 1 },
        },
        {
          keys: ['钥匙'],
          keysecondary: ['档案室', '钟楼'],
          selective: true,
          selectiveLogic: 0,
          content: '【黄铜钥匙】阿绫腰间的黄铜钥匙能打开档案室，但每次使用都会让她忘记一个名字。',
          comment: '黄铜钥匙',
          constant: false,
          position: 4,
          depth: 2,
          extensions: { position: 4 },
        },
      ],
    },
  },
};

fs.writeFileSync(path.join(outDir, 'card.json'), JSON.stringify(card, null, 2), 'utf8');

fs.writeFileSync(
  path.join(outDir, 'worldbook.json'),
  JSON.stringify(
    {
      entries: {
        0: {
          uid: 0,
          key: ['海边', '海雾'],
          comment: '海雾',
          content: '海雾里会传来不属于这个时代的船笛声，听见的人会梦见同一片海。',
          constant: false,
          position: 1,
          order: 20,
        },
        1: {
          uid: 1,
          key: [],
          comment: '文风',
          content: '叙述保持潮湿、安静、带一点旧木头的味道。',
          constant: true,
          position: 0,
          order: 1,
        },
      },
    },
    null,
    2,
  ),
  'utf8',
);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'latin1');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(text) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(Buffer.from([0, 0, 0, 0, 0]));
  const textChunk = chunk(
    'tEXt',
    Buffer.concat([Buffer.from('chara', 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]),
  );
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    textChunk,
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const base64 = Buffer.from(JSON.stringify(card), 'utf8').toString('base64');
fs.writeFileSync(path.join(outDir, 'card.png'), makePng(base64));

console.log('Fixtures written to', outDir);

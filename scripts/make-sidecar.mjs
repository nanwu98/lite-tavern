import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'tests', 'fixtures', 'sidecar');
fs.mkdirSync(dir, { recursive: true });

const card = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  name: '侧车测试·阿澈',
  description: '阿澈是旧城邮局的夜班分拣员，{{char}}知道每封退信的去向。',
  personality: '懒散、心软、爱喝冷掉的咖啡。',
  scenario: '凌晨两点的邮局，只剩分拣机的嗡嗡声。',
  first_mes: '*阿澈从信件堆里抬起头。*「又是你。今晚想找哪封信？」',
  data: {
    name: '侧车测试·阿澈',
    description: '阿澈是旧城邮局的夜班分拣员，{{char}}知道每封退信的去向。',
    personality: '懒散、心软、爱喝冷掉的咖啡。',
    scenario: '凌晨两点的邮局，只剩分拣机的嗡嗡声。',
    first_mes: '*阿澈从信件堆里抬起头。*「又是你。今晚想找哪封信？」',
    extensions: { world: '侧车世界书' },
    tags: ['测试'],
  },
};

const world = {
  entries: {
    0: {
      key: [],
      comment: '邮局常驻',
      content: '旧城邮局的退信都会在午夜被送进地下室，那里没有门牌。',
      constant: true,
      position: 0,
      order: 1,
    },
    1: {
      key: ['退信', '地下室'],
      comment: '退信规则',
      content: '寻找退信必须在信封背面写上收件人真正的名字，否则信会回到寄件人手里。',
      constant: false,
      position: 1,
      order: 10,
    },
  },
};

fs.writeFileSync(path.join(dir, 'electron-card.json'), JSON.stringify(card, null, 2), 'utf8');
fs.writeFileSync(path.join(dir, '侧车世界书.json'), JSON.stringify(world, null, 2), 'utf8');
console.log('sidecar fixtures written');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('every browser script parses before deployment', () => {
  for (const file of fs.readdirSync(path.join(__dirname, '../frontend/js'))) {
    if (file.endsWith('.js')) new vm.Script(fs.readFileSync(path.join(__dirname, '../frontend/js', file), 'utf8'), { filename: file });
  }
});
test('HTML pages have unique control IDs and existing local scripts', () => {
  const directory = path.join(__dirname, '../frontend');
  for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.html'))) {
    const text = fs.readFileSync(path.join(directory, file), 'utf8');
    const ids = [...text.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${file} contains duplicate IDs`);
    for (const [, src] of text.matchAll(/<script\s+src="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(directory, src)), `${file}: missing ${src}`);
  }
});

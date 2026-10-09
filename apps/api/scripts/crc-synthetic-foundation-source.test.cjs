'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname,'..');
const script = fs.readFileSync(path.join(__dirname,'crc-synthetic-foundation.cjs'),'utf8');
const schema = fs.readFileSync(path.join(root,'prisma/schema.prisma'),'utf8');
const ast = ts.createSourceFile('genesis.cjs',script,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
const models = new Map([...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(m =>
  [m[1].slice(0,1).toLowerCase()+m[1].slice(1),new Set([...m[2].matchAll(/^\s*([a-zA-Z]\w*)\s+\w+/gm)].map(f => f[1]))]));
test('all synthetic foundation Prisma delegates and explicit create fields match current schema',()=>{
  let checked=0;
  function walk(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'create' && ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.expression.getText(ast) === 'tx') {
      const model = node.expression.expression.name.text;
      assert.ok(models.has(model),`Unknown Prisma model delegate: ${model}`);
      const opts = node.arguments[0];
      assert.ok(opts && ts.isObjectLiteralExpression(opts));
      const data = opts.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast)==='data');
      assert.ok(data, `Missing data argument in ${model}`);
      if (!ts.isObjectLiteralExpression(data.initializer)) {
        assert.equal(model, 'user', 'Only synthetic user(uid) factory may be nonliteral');
        return;
      }
      for(const p of data.initializer.properties){
        if(ts.isShorthandPropertyAssignment(p)||ts.isSpreadAssignment(p))continue;
        if(ts.isPropertyAssignment(p)){
          const field=p.name.getText(ast).replace(/["']/g,'');
          assert.ok(models.get(model).has(field),`${model}.${field} is absent from current Prisma schema`);
          checked++;
        }
      }
    }
    ts.forEachChild(node,walk);
  }
  walk(ast);
  assert.ok(checked >= 100,`Too few reviewed Prisma properties: ${checked}`);
});

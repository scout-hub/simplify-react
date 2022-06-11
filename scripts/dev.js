/*
 * @Author: Zhouqi
 * @Date: 2022-04-28 15:14:45
 * @LastEditors: Zhouqi
 * @LastEditTime: 2022-06-11 20:17:25
 */
const {
    build
} = require('esbuild')

build({
    entryPoints: [`./packages/react/index.ts`],
    outfile: './build/simplify-react.global.js',
    bundle: true,
    sourcemap: true,
    format: 'iife',
    globalName: 'React',
    watch: {
        onRebuild(error) {
            console.log('rebuild');
        }
    }
}).then(() => {
    console.log(`watching`)
})

build({
    entryPoints: [ `./packages/react-dom/src/index.ts`],
    outfile: './build/simplify-react-dom.global.js',
    bundle: true,
    sourcemap: true,
    format: 'iife',
    globalName: 'ReactDOM',
    watch: {
        onRebuild(error) {
            console.log('rebuild');
        }
    }
}).then(() => {
    console.log(`watching`)
})
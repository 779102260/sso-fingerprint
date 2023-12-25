import { createServer  } from "node:http";
import fs from "node:fs";
import querystring from "node:querystring";
import { createRouter, createApp, toNodeListener, } from "@yangsansuan/h3";
import type { App, H3Event  } from "@yangsansuan/h3";
import { generateSessionId } from "./util";

const getSession = async (user: string) => {
    const session = await fs.promises.readFile('session.json').then(res => JSON.parse(res.toString() || '{}'))
    const {expire, value} = session[user] ?? {}
    // 验证是否过期
    if (Date.now() > expire) {
        delete session[user]
        return null
    }
    return value
}
const setSession = async (user: string, value: string) => {
    const session = await fs.promises.readFile('session.json').then(res => {
        return JSON.parse(res.toString() || '{}')
    })
    session[user] = {
        value,
        expire: Date.now() + 3600 * 1000
    }
    await fs.promises.writeFile('session.json', JSON.stringify(session))
}
const getUserBySessionId = async (sessionId?: string) => {
    if (!sessionId) {
        return null
    }
    const session = await fs.promises.readFile('session.json').then(res => JSON.parse(res.toString() || '{}'))
    for (const _user in session) {
        if (session[_user].value === sessionId) {
           return _user
        }
    }
    return null
}

const getFingerprint = async (_fingerprint?: string) => {
    if (!_fingerprint) {
        return null
    }
    const fingerprint = await fs.promises.readFile('fingerprint.json').then(res => JSON.parse(res.toString() || '{}'))
    const user = fingerprint[_fingerprint]
    if (!user) {
        return
    }
    const sessionId =  await getSession(user)
    return {user, sessionId}
}
const setFigerprint = async (_fingerprint: string, user: string) => {
    const fingerprint = await fs.promises.readFile('fingerprint.json').then(res => JSON.parse(res.toString() || '{}'))
    fingerprint[_fingerprint] = user
    await fs.promises.writeFile('fingerprint.json', JSON.stringify(fingerprint))
}


export function listen(port: number): App {
    const router = createRouter()
        .get('/', async (event) => {
            // -- 初始化参数 --
            let {user = '', fingerprint: _fingerprint} = getQuery(event)

            // -- 读取cookie sessionId --
            let sessionId = getSessionIdFromCookie(event)
            
            // -- 通过指纹读取用户  --
            let isFoundByFingerprint = false
            if (!sessionId) {
               const res = await getFingerprint(_fingerprint)
               if (res) {
                   user = res?.user
                   sessionId = res?.sessionId
                   isFoundByFingerprint = true
               }
            }

            if (user) {
                // 未登录或者已过期 set-cookie sessionId 
                if (!sessionId || !await getSession(user)) {
                    sessionId  = generateSessionId();
                    // 存储会话
                    setSession(user, sessionId)
                    event.node.res.setHeader('set-cookie', `sessionId=${sessionId}; path=/; max-age=3600;`);
                }
            }
            
            let res =  await fs.promises.readFile('index1.html', 'utf-8');
            res = res.replace('xxxxx', JSON.stringify({'用户': user || '', '携带的cookie': event.node.req.headers.cookie || '', 'sessionId': sessionId || '', 'fingerprint': _fingerprint || '', '是否通过fingerprint找到的用户': isFoundByFingerprint}))

            return res
        })
        /** 存储指纹 */
        .post('/setFigerprint', async (event) => {
            const {fingerprint: _fingerprint, user} = getQuery(event)
            if (_fingerprint && user) {
                setFigerprint(_fingerprint, user)
            }
            return 'ok'
        })
        .get('/api', async (event) => {
            // -- 读取cookie sessionId --
            const {fingerprint: _fingerprint} = getQuery(event)
            let sessionId = getSessionIdFromCookie(event)

            // -- 允许跨域 --
            event.node.res.setHeader('Access-Control-Allow-Origin', '*');
            
            // -- 查找用户信息   --
            let user;
            let isFoundByFingerprint = false
            if  (!sessionId) {
                const res = await getFingerprint(_fingerprint)
                if (res) {
                    user = res?.user
                    sessionId = res?.sessionId
                    isFoundByFingerprint = true
                }
            } else {
                user = await getUserBySessionId(sessionId)
            }

            return {'用户': user || '', '携带的cookie': event.node.req.headers.cookie || '',  'sessionId': sessionId || '', 'fingerprint': _fingerprint || '', '是否通过fingerprint找到了用户': isFoundByFingerprint}
        })

    const app = createApp().use(router);
    createServer(toNodeListener(app)).listen(port)

    console.log(`http://localhost:${port}`)

    return app
}


function getSessionIdFromCookie(event: H3Event) {
    const cookie = event.node.req.headers.cookie ?? '';
    const sessionId = cookie.match(/sessionId=([^;]+)/)?.[1]
    return sessionId
}

type IQuery = {user?: string; fingerprint?: string; [key: string]: any}
function getQuery(event: H3Event): IQuery {
    const url = event.node.req.url
    const query = querystring.parse(url?.split('?')[1] ?? '')
    return query
}
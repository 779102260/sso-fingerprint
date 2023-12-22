使用fingerprint做单点登录（sso）示例

## 优势

1. 可跨域调用接口
2. 支持无痕模式
3. 支持跨无痕模式和非无痕模式
4. 无需token

## 运行

1. 本地绑定host
127.0.0.1 a.com
127.0.0.1 b.com

2. 启动项目

```shell
pnpm i
pnpm run dev
```

3. 分别打开下面2个链接

```
http://a.com:3000/?user=ccc // 这里模拟登录
http://b.com:3001/ // 这里模拟未登录
```
可以看到b.com接口正确获取了a.com的数据user和sessionId
## Problem Statement
需要在 API 调用时添加缓存层来提高性能和减少重复请求。

## Context
- **Current behavior:** 每次 API 调用都会直接请求后端，无缓存
- **Desired behavior:** 对相同请求进行缓存，减少重复网络调用
- **Related files:** 需要确定 API 调用入口文件

## Proposed Approaches

### Approach 1: 内存缓存 (In-Memory Cache)
使用 Node.js 内置的 Map 或 lru-cache 库实现简单内存缓存。

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache({ max: 500, ttl: 1000 * 60 * 5 });

export async function fetchWithCache(key: string, fetcher: () => Promise<any>) {
  const cached = cache.get(key);
  if (cached) return cached;
  
  const result = await fetcher();
  cache.set(key, result);
  return result;
}
```

**Pros:** 实现简单，无需额外依赖，查询速度快
**Cons:** 进程重启后缓存丢失，内存占用随请求增长，分布式环境下不共享
**Effort:** Small
**Libraries:** lru-cache (推荐), node-cache

### Approach 2: HTTP 缓存 (Cache-Control Headers)
利用浏览器和 HTTP 层级的缓存机制，通过设置响应头实现。

```typescript
// Next.js API Route 示例
export async function GET(request: Request) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
    }
  });
}
```

**Pros:** 无需额外代码，利用 CDN 和浏览器缓存，支持服务端渲染优化
**Cons:** 只对 GET 请求有效，缓存策略不够灵活
**Effort:** Small
**Libraries:** 原生支持

### Approach 3: Redis 分布式缓存
使用 Redis 作为分布式缓存存储，适合多实例部署。

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export async function fetchWithRedis(key: string, fetcher: () => Promise<any>) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const result = await fetcher();
  await redis.setex(key, 300, JSON.stringify(result)); // 5分钟 TTL
  return result;
}
```

**Pros:** 进程间共享，持久化，支持过期策略，适合分布式架构
**Cons:** 需要额外基础设施（Redis），增加网络延迟，复杂度高
**Effort:** Medium
**Libraries:** ioredis, @upstash/redis, @vercel/kv

## Recommendation
如果仅用于本地/单机部署，推荐 Approach 1 (lru-cache)，实现简单且性能好。如果需要多实例共享或长期缓存，推荐 Approach 3 (Redis)。

对于 Next.js 项目，也可以结合 Approach 2 使用 unstable_cache 或 Next.js 的 fetch 缓存机制。

## Out of Scope
- 缓存失效策略的具体实现
- 缓存监控和指标收集
- 多层缓存架构（如 L1/L2）

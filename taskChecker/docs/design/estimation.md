# TeamFlow - Back-of-the-Envelope Estimation

## Inputs
| Parameter | Value | Source |
|-----------|-------|--------|
| DAU | 10,000 | Requirements (startup target) |
| Actions/user/day | 50 | Requirements (balanced read/write) |
| Peak factor | 2x | Standard assumption |
| Avg object size (text) | 2 KB | Task + metadata |
| Media fraction | 5% | Attachments on tasks |
| Media size | 1 MB | Typical file upload |
| Retention | 365 days | Requirements |
| Audit log retention | 7 years | Compliance |
| Per-server QPS (Postgres) | 1,000 | BOTEC reference |

## Calculations

### QPS
```
Daily actions = 10,000 × 50 = 500,000
Average QPS = 500,000 ÷ 86,400 ≈ 5.8 QPS
Peak QPS = 2 × 5.8 ≈ 12 QPS
```

**At 10x growth (100K DAU):**
```
Peak QPS ≈ 120 QPS
```

### Storage

**Text Data (Postgres):**
```
Daily writes = 500,000 × 50% × 2 KB = 500 MB/day
Annual = 500 MB × 365 ≈ 180 GB/year
At 100K DAU: ~1.8 TB/year
```

**Media (S3):**
```
Daily media = 500,000 × 5% × 1 MB = 25 GB/day
Annual = 25 GB × 365 ≈ 9 TB/year
At 100K DAU: ~90 TB/year
```

**Audit Logs:**
```
Mutations ≈ 500,000 × 50% = 250,000/day
Log entry ≈ 500 bytes
Daily = 125 MB/day
7 years = 125 MB × 365 × 7 ≈ 315 GB
```

### Bandwidth
```
Write ingress (peak) = 12 QPS × 2 KB ≈ 24 KB/s
Read egress (peak) = 12 QPS × 10 KB ≈ 120 KB/s
At 100K DAU: ~2.4 MB/s ingress, ~12 MB/s egress
```

### Server Sizing
```
Current peak QPS: 12 << 1,000 (single Postgres node)
100K DAU peak QPS: 120 << 1,000 (still single node)

API servers: 12 QPS trivial for Node.js (can handle 10k+/core)
WebSocket servers: 10K concurrent connections per small instance
Redis: Single node handles 100K+ QPS easily
```

### Cache Sizing (80/20 Rule)
```
Hot set ≈ 20% × (daily reads × avg_response_size)
Daily reads = 250,000
Avg response = 10 KB
Hot set ≈ 20% × 2.5 GB ≈ 500 MB
Fits easily in single Redis instance (few GB)
```

## Architecture Implications

| Metric | Current | 100K DAU | Implication |
|--------|---------|----------|-------------|
| Peak QPS | 12 | 120 | Single Postgres node sufficient |
| Text storage/yr | 180 GB | 1.8 TB | Vertical scaling → read replicas |
| Media storage/yr | 9 TB | 90 TB | S3 + lifecycle policies essential |
| Cache hot set | 500 MB | 5 GB | Single Redis → cluster mode later |
| WebSocket conns | ~5K | ~50K | Single WS server → horizontal scale |

## Key Conclusions
1. **No sharding needed** at current or near-term scale
2. **Read replicas** for Postgres when read load grows
3. **S3 + CloudFront** for media from day one
4. **Redis cluster** only when memory > 20GB
5. **Horizontal API/WS scaling** via load balancer when needed
6. **Background workers** scale independently via queue depth
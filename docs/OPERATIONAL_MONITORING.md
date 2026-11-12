# Operational Monitoring & Observability Guide

This document outlines monitoring, logging, alerting, and incident response for Sway in production.

## Overview

Production monitoring ensures:
- System health and availability
- Performance metrics tracking
- Error detection and alerting
- User experience monitoring
- Security incident detection

## Monitoring Stack Recommendations

### Option 1: All-in-One (Recommended for Startups)

**Sentry** - Error tracking and performance monitoring
- **Cost**: Free up to 5K events/month, then $26/month
- **Features**: Error tracking, performance monitoring, release tracking
- **Integration**: SDK for Cloudflare Workers

**Better Stack (formerly Logtail)** - Logging and uptime monitoring
- **Cost**: Free up to 1GB/month, then $10/month
- **Features**: Log aggregation, uptime monitoring, status page
- **Integration**: HTTP endpoint for Workers

**Supabase Dashboard** - Database monitoring (built-in)
- **Cost**: Included with Supabase
- **Features**: Query performance, database size, connection pool

### Option 2: Best-in-Class

- **Sentry**: Error tracking
- **Datadog**: APM and infrastructure
- **PagerDuty**: On-call and incident management
- **Grafana Cloud**: Dashboards and visualization
- **Cost**: $200-500/month

### Option 3: Budget (Free Tier Only)

- **Sentry Free**: 5K errors/month
- **Cloudflare Analytics**: Built-in
- **Supabase Logs**: Built-in
- **UptimeRobot Free**: 50 monitors
- **Cost**: $0/month (with limits)

## Metrics to Monitor

### Application Metrics

**Request Metrics**
- Total requests per minute/hour
- Requests by endpoint
- Response times (p50, p95, p99)
- Error rate (4xx, 5xx)
- Request size distribution

**Business Metrics**
- New user sign-ups per day
- Active users (DAU, MAU)
- Posts created per day
- Messages sent per day
- Connection requests per day
- Reports submitted per day

**Performance Metrics**
- API response time by endpoint
- Database query time
- Supabase RPC function duration
- Cloudinary upload time
- Cache hit rate (if implemented)

**Error Metrics**
- Error count by type
- Error rate (errors/total requests)
- Failed database queries
- Failed external API calls
- Validation failures

### Infrastructure Metrics

**Cloudflare Workers**
- CPU time used
- Memory usage
- Invocations count
- Concurrent requests
- Cold start frequency

**Supabase Database**
- Active connections
- Query duration
- Slow queries (>1s)
- Database size
- Table sizes
- Index usage

**Cloudinary**
- Storage used
- Bandwidth used
- Transformations used
- Failed uploads

## Logging Strategy

### Log Levels

```typescript
enum LogLevel {
  ERROR = 'error',    // Critical errors requiring immediate attention
  WARN = 'warn',      // Warning conditions, potential issues
  INFO = 'info',      // Normal operations, business events
  DEBUG = 'debug'     // Detailed diagnostic information
}
```

### What to Log

**DO Log:**
- ✅ Authentication failures
- ✅ Authorization failures
- ✅ API errors (with request ID)
- ✅ Slow queries (>500ms)
- ✅ Failed external API calls
- ✅ Moderation actions
- ✅ User account actions (suspend, ban)
- ✅ Rate limit violations

**DON'T Log:**
- ❌ Passwords or secrets
- ❌ Full JWT tokens
- ❌ User personal information
- ❌ Private message content (unless investigating abuse)
- ❌ Credit card numbers (N/A for this app)

### Structured Logging Example

```typescript
// src/lib/logger.ts
export interface LogContext {
  requestId: string;
  userId?: string;
  endpoint: string;
  method: string;
  ip?: string;
  [key: string]: any;
}

export function logError(
  message: string,
  error: Error,
  context: LogContext
) {
  const logEntry = {
    level: 'error',
    message,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    context,
    timestamp: new Date().toISOString()
  };

  // In production, send to logging service
  if (process.env.LOGTAIL_TOKEN) {
    fetch('https://in.logtail.com', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LOGTAIL_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logEntry)
    }).catch(console.error);
  }

  // Always log to console for Cloudflare logs
  console.error(JSON.stringify(logEntry));
}
```

## Sentry Integration

### Installation

```bash
npm install @sentry/node
```

### Configuration

```typescript
// src/lib/sentry.ts
import * as Sentry from '@sentry/node';

export function initSentry(env: Bindings) {
  if (env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.ENVIRONMENT || 'production',
      tracesSampleRate: 0.1, // 10% of transactions
      // Release tracking
      release: env.RELEASE_VERSION,
      // Ignore expected errors
      ignoreErrors: [
        'NetworkError',
        'AbortError'
      ],
      // Add user context
      beforeSend(event, hint) {
        // Remove sensitive data
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers?.['authorization'];
        }
        return event;
      }
    });
  }
}

export function captureError(
  error: Error,
  context?: Record<string, any>
) {
  Sentry.captureException(error, {
    extra: context
  });
}
```

### Usage in Routes

```typescript
try {
  // Your route logic
} catch (err) {
  captureError(err, {
    userId: c.get('user')?.id,
    endpoint: c.req.path,
    method: c.req.method
  });
  throw err;
}
```

## Alerting Strategy

### Alert Levels

**Critical (Page immediately)**
- 5xx error rate >5%
- Database unreachable
- Auth service down
- P99 latency >5s

**High (Page within 15 minutes)**
- 4xx error rate >20%
- Slow queries >1s affecting >10% requests
- Moderation queue >100 items
- Failed external API calls >50/hour

**Medium (Notify within 1 hour)**
- Disk space >80%
- Memory usage >80%
- Unusual traffic patterns
- Error rate increase >2x baseline

**Low (Daily digest)**
- Failed jobs
- Deprecated API usage
- Cache misses

### Alert Configuration Examples

**Better Stack Alert: High Error Rate**
```json
{
  "name": "High Error Rate",
  "query": "status:500 OR status:502 OR status:503",
  "threshold": "count > 10",
  "window": "5m",
  "notification_channels": ["pagerduty", "slack"]
}
```

**Sentry Alert: New Error Type**
```json
{
  "name": "New Error Introduced",
  "conditions": [
    {
      "id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition"
    }
  ],
  "actions": [
    {
      "id": "sentry.rules.actions.notify_event_service.NotifyEventServiceAction",
      "service": "slack"
    }
  ]
}
```

## Health Checks

### Endpoint Implementation

```typescript
// Extended health check
app.get('/health/full', async c => {
  const checks = {
    api: 'ok',
    database: 'unknown',
    timestamp: new Date().toISOString()
  };

  // Check database
  try {
    const response = await fetch(
      `${c.env.SUPABASE_URL}/rest/v1/profiles?limit=1`,
      {
        headers: {
          'apikey': c.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${c.env.SUPABASE_ANON_KEY}`
        }
      }
    );
    checks.database = response.ok ? 'ok' : 'degraded';
  } catch (err) {
    checks.database = 'down';
  }

  const allHealthy = Object.values(checks).every(
    status => status === 'ok'
  );

  return c.json(checks, allHealthy ? 200 : 503);
});
```

### UptimeRobot Configuration

1. Add HTTP(s) monitor
2. URL: `https://your-worker.workers.dev/health`
3. Interval: 5 minutes
4. Alert after: 2 down checks
5. Notifications: Email, SMS, Slack

## Dashboard Recommendations

### Key Dashboards

**1. Overview Dashboard**
- Request rate (last 24h)
- Error rate (last 24h)
- Response time (p95)
- Active users (last 1h)
- Database health
- System status

**2. Performance Dashboard**
- Response time by endpoint
- Slow queries
- Cache hit rate
- External API latency
- Database connection pool

**3. Business Dashboard**
- New users (daily)
- Active users (DAU, MAU)
- Posts created (daily)
- Messages sent (daily)
- Moderation queue size
- Reports submitted

**4. Errors Dashboard**
- Errors by type
- Errors by endpoint
- 5xx error trend
- Failed auth attempts
- Rate limit violations

### Grafana Dashboard JSON

```json
{
  "dashboard": {
    "title": "Sway API Overview",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m]))"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{status=~\"5..\"}[5m]))"
          }
        ]
      }
    ]
  }
}
```

## Incident Response

### Incident Severity Levels

**Severity 1 (Critical)**
- Service completely down
- Data breach
- Security vulnerability actively exploited
- **Response Time**: Immediate
- **On-call**: Wake up engineer

**Severity 2 (High)**
- Major feature broken
- Elevated error rates
- Performance severely degraded
- **Response Time**: 15 minutes
- **On-call**: Page engineer

**Severity 3 (Medium)**
- Minor feature broken
- Intermittent errors
- Performance degraded
- **Response Time**: 1 hour
- **On-call**: Alert engineer

**Severity 4 (Low)**
- Visual bugs
- Non-critical errors
- **Response Time**: Next business day
- **On-call**: Email team

### Incident Response Process

**1. Detection**
- Alert fired
- User report
- Manual discovery

**2. Triage (5 minutes)**
- Assess severity
- Assign incident commander
- Create incident channel (#incident-YYYY-MM-DD)
- Page on-call engineer if needed

**3. Investigation (15 minutes)**
- Check monitoring dashboards
- Review recent deployments
- Check error logs
- Identify root cause

**4. Mitigation (varies)**
- Rollback deployment if recent
- Apply hotfix
- Scale resources
- Disable problematic feature

**5. Communication**
- Update status page
- Notify affected users (if major)
- Post updates every 30 minutes

**6. Resolution**
- Verify fix
- Monitor for recurrence
- Update status page
- Notify users

**7. Post-Mortem (within 48 hours)**
- Write incident report
- Identify root cause
- Document action items
- Assign owners
- Set deadlines

### Post-Mortem Template

```markdown
# Incident Post-Mortem: [Title]

## Summary
Brief description of what happened.

## Timeline
- 14:23 UTC: Alert fired for high error rate
- 14:25 UTC: Engineer paged
- 14:30 UTC: Root cause identified
- 14:45 UTC: Fix deployed
- 15:00 UTC: Incident resolved

## Impact
- Duration: 37 minutes
- Affected users: ~500
- Failed requests: 1,247
- Revenue impact: $0

## Root Cause
Detailed explanation of what caused the incident.

## What Went Well
- Quick detection via monitoring
- Fast response time
- Clear communication

## What Went Wrong
- No pre-deployment testing of edge case
- Alert threshold too high
- Rollback took too long

## Action Items
1. [ ] Add test for edge case (Owner: Alice, Due: 2024-01-15)
2. [ ] Lower alert threshold to 2% (Owner: Bob, Due: 2024-01-10)
3. [ ] Document rollback procedure (Owner: Charlie, Due: 2024-01-12)
```

## Monitoring Checklist

### Pre-Launch
- [ ] Set up error tracking (Sentry)
- [ ] Set up logging (Better Stack/Logtail)
- [ ] Configure uptime monitoring
- [ ] Create dashboards
- [ ] Configure alerts
- [ ] Test alerting pipeline
- [ ] Document on-call procedures
- [ ] Set up status page

### Post-Launch
- [ ] Monitor daily for first week
- [ ] Tune alert thresholds
- [ ] Add missing metrics
- [ ] Review dashboards weekly
- [ ] Conduct incident drills
- [ ] Update runbooks

## Cost Optimization

### Free Tier Limits
- Sentry: 5K events/month
- Better Stack: 1GB logs/month
- Cloudflare: Unlimited requests (Workers Paid plan)
- Supabase: Included monitoring

### When to Upgrade
- Error volume exceeds free tier
- Need longer log retention (>7 days)
- Need advanced features (APM, tracing)
- Team size >3 engineers

### Budget Guidelines
- **Startup (<10K users)**: $50-100/month
- **Growing (10K-100K users)**: $200-500/month
- **Scale (>100K users)**: $1000+/month

## Resources

### Services
- [Sentry](https://sentry.io/)
- [Better Stack](https://betterstack.com/)
- [Datadog](https://www.datadoghq.com/)
- [PagerDuty](https://www.pagerduty.com/)
- [UptimeRobot](https://uptimerobot.com/)
- [Grafana Cloud](https://grafana.com/products/cloud/)

### Documentation
- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/)
- [Supabase Monitoring](https://supabase.com/docs/guides/platform/metrics)
- [Sentry Workers SDK](https://docs.sentry.io/platforms/javascript/guides/cloudflare-workers/)

### Books
- "Site Reliability Engineering" (Google)
- "The Phoenix Project" (DevOps)
- "Accelerate" (DevOps Research)

// Cowork plugins extracted from anthropics/knowledge-work-plugins marketplace.
// Used to inject managedMcpServers into Claude Cowork (3p mode) configLibrary entries.

const COWORK_PLUGINS = [
  {
    "name": "tavily",
    "description": "Tavily - Real-time web search API optimized for LLM agents. Search and extract content from the web.",
    "servers": [
      {
        "key": "tavily",
        "url": "https://mcp.tavily.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "lseg",
    "description": "Price bonds, analyze yield curves, evaluate FX carry trades, value options, and build macro dashboards using LSEG financial data and analytics.",
    "servers": [
      {
        "key": "lseg",
        "url": "https://api.analytics.lseg.com/lfa/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "sp-global",
    "description": "S&P Global - Financial data and analytics skills including company tearsheets, earnings previews, and transaction summaries",
    "servers": [
      {
        "key": "spglobal",
        "url": "https://kfinance.kensho.com/integrations/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "adobe-for-creativity",
    "description": "Brings together Adobe Creative Cloud tools for images, vectors, design, and video. Edit multiple assets at once, adapt for different platforms, and complete multi-step creative workflows for polished ",
    "servers": [
      {
        "key": "Adobe for creativity",
        "url": "https://adobe-creativity.adobe.io/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "figma",
    "description": "Figma design platform integration. Access design files, extract component information, read design tokens, and translate designs into code. Bridge the gap between design and development workflows.",
    "servers": [
      {
        "key": "figma",
        "url": "https://mcp.figma.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "atlan",
    "description": "Atlan data catalog plugin for Claude Code. Search, explore, govern, and manage your data assets through natural language. Powered by the Atlan MCP server with semantic search, lineage traversal, gloss",
    "servers": [
      {
        "key": "atlan",
        "url": "https://mcp.atlan.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "cloudinary",
    "description": "Use Cloudinary directly in Claude. Manage assets, apply transformations, optimize media, and more through natural conversation.",
    "servers": [
      {
        "key": "cloudinary-asset-mgmt",
        "url": "https://asset-management.mcp.cloudinary.com/mcp",
        "type": "http"
      },
      {
        "key": "cloudinary-env-config",
        "url": "https://environment-config.mcp.cloudinary.com/mcp",
        "type": "http"
      },
      {
        "key": "cloudinary-smd",
        "url": "https://structured-metadata.mcp.cloudinary.com/mcp",
        "type": "http"
      },
      {
        "key": "cloudinary-analysis",
        "url": "https://analysis.mcp.cloudinary.com/sse",
        "type": "http"
      },
      {
        "key": "cloudinary-mediaflows",
        "url": "https://mediaflows.mcp.cloudinary.com/v2/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "prisma",
    "description": "Prisma MCP integration for Postgres database management, schema migrations, SQL queries, and connection string management. Provision Prisma Postgres databases, run migrations, and interact with your d",
    "servers": [
      {
        "key": "Prisma-Remote",
        "url": "https://mcp.prisma.io/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "cockroachdb",
    "description": "CockroachDB plugin for Claude Code — explore schemas, write optimized SQL, debug queries, and manage distributed database clusters directly from your AI coding agent.",
    "servers": [
      {
        "key": "cockroachdb-toolbox-http",
        "url": "http://127.0.0.1:5000/mcp",
        "type": "http"
      },
      {
        "key": "cockroachdb-cloud",
        "url": "https://cockroachlabs.cloud/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "daloopa",
    "description": "Financial analysis skills powered by Daloopa's institutional-grade data",
    "servers": [
      {
        "key": "daloopa",
        "url": "https://mcp.daloopa.com/server/mcp",
        "type": "http"
      },
      {
        "key": "daloopa-docs",
        "url": "https://docs.daloopa.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "intercom",
    "description": "Intercom integration for Claude Code. Search conversations, analyze customer support patterns, look up contacts and companies, and install the Intercom Messenger. Connect your Intercom workspace to ge",
    "servers": [
      {
        "key": "intercom",
        "url": "https://mcp.intercom.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "zoominfo",
    "description": "Search companies and contacts, enrich leads, find lookalikes, and get AI-ranked contact recommendations. Pre-built skills chain multiple ZoomInfo tools into complete B2B sales workflows.",
    "servers": [
      {
        "key": "zoominfo",
        "url": "https://mcp.zoominfo.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "sanity-plugin",
    "description": "Sanity content platform integration with MCP server, agent skills, and slash commands. Query and author content, build and optimize GROQ queries, design schemas, and set up Visual Editing.",
    "servers": [
      {
        "key": "Sanity",
        "url": "https://mcp.sanity.io",
        "type": "http"
      }
    ]
  },
  {
    "name": "adspirer-ads-agent",
    "description": "Cross-platform ad management for Google Ads, Meta Ads, TikTok Ads, and LinkedIn Ads. 91 tools for keyword research, campaign creation, performance analysis, and budget optimization.",
    "servers": [
      {
        "key": "adspirer",
        "url": "https://mcp.adspirer.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "planetscale",
    "description": "An authenticated hosted MCP server that accesses your PlanetScale organizations, databases, branches, schema, and Insights data. Query against your data, surface slow queries, and get organizational a",
    "servers": [
      {
        "key": "planetscale",
        "url": "https://mcp.pscale.dev/mcp/planetscale",
        "type": "http"
      }
    ]
  },
  {
    "name": "miro",
    "description": "Secure access to Miro boards. Enables AI to read board context, create diagrams, and generate code with enterprise-grade security.",
    "servers": [
      {
        "key": "miro",
        "url": "https://mcp.miro.com/",
        "type": "http"
      }
    ]
  },
  {
    "name": "zoom-plugin",
    "description": "Plan, build, and debug Zoom integrations across REST APIs, Meeting SDK, Video SDK, webhooks, bots, and MCP workflows. Search meetings, retrieve recordings, access transcripts, and design AI-powered Zo",
    "servers": [
      {
        "key": "zoom-mcp",
        "url": "https://mcp-us.zoom.us/mcp/zoom/streamable",
        "type": "http"
      },
      {
        "key": "zoom-docs-mcp",
        "url": "https://mcp.zoom.us/mcp/docs/streamable",
        "type": "http"
      },
      {
        "key": "zoom-whiteboard-mcp",
        "url": "https://mcp-us.zoom.us/mcp/whiteboard/streamable",
        "type": "http"
      }
    ]
  },
  {
    "name": "bigdata-com",
    "description": "Official Bigdata.com plugin providing financial research, analytics, and intelligence tools powered by Bigdata MCP.",
    "servers": [
      {
        "key": "bigdata.com",
        "url": "https://mcp.bigdata.com",
        "type": "http"
      }
    ]
  },
  {
    "name": "operations",
    "description": "Optimize business operations — vendor management, process documentation, change management, capacity planning, and compliance tracking. Keep your organization running efficiently.",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "notion",
        "url": "https://mcp.notion.com/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "asana",
        "url": "https://mcp.asana.com/v2/mcp",
        "type": "http"
      },
      {
        "key": "servicenow",
        "url": "https://mcp.servicenow.com/mcp",
        "type": "http"
      },
      {
        "key": "ms365",
        "url": "https://microsoft365.mcp.claude.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "brand-voice",
    "description": "Discover your brand voice from existing documents and conversations, generate enforceable guidelines, and validate AI-generated content against your established tone and positioning.",
    "servers": [
      {
        "key": "notion",
        "url": "https://mcp.notion.com/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "box",
        "url": "https://mcp.box.com",
        "type": "http"
      },
      {
        "key": "figma",
        "url": "https://mcp.figma.com/mcp",
        "type": "http"
      },
      {
        "key": "gong",
        "url": "https://mcp.gong.io/mcp",
        "type": "http"
      },
      {
        "key": "microsoft-365",
        "url": "https://microsoft365.mcp.claude.com/mcp",
        "type": "http"
      },
      {
        "key": "granola",
        "url": "https://mcp.granola.ai/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "human-resources",
    "description": "Streamline people operations — recruiting, onboarding, performance reviews, compensation analysis, and policy guidance. Maintain compliance and keep your team running smoothly.",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "notion",
        "url": "https://mcp.notion.com/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "ms365",
        "url": "https://microsoft365.mcp.claude.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "design",
    "description": "Accelerate design workflows — critique, design system management, UX writing, accessibility audits, research synthesis, and dev handoff. From exploration to pixel-perfect specs.",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "figma",
        "url": "https://mcp.figma.com/mcp",
        "type": "http"
      },
      {
        "key": "linear",
        "url": "https://mcp.linear.app/mcp",
        "type": "http"
      },
      {
        "key": "asana",
        "url": "https://mcp.asana.com/v2/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "notion",
        "url": "https://mcp.notion.com/mcp",
        "type": "http"
      },
      {
        "key": "intercom",
        "url": "https://mcp.intercom.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "engineering",
    "description": "Streamline engineering workflows — standups, code review, architecture decisions, incident response, and technical documentation. Works with your existing tools or standalone.",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "linear",
        "url": "https://mcp.linear.app/mcp",
        "type": "http"
      },
      {
        "key": "asana",
        "url": "https://mcp.asana.com/v2/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "notion",
        "url": "https://mcp.notion.com/mcp",
        "type": "http"
      },
      {
        "key": "github",
        "url": "https://api.githubcopilot.com/mcp/",
        "type": "http"
      },
      {
        "key": "pagerduty",
        "url": "https://mcp.pagerduty.com/mcp",
        "type": "http"
      },
      {
        "key": "datadog",
        "url": "https://mcp.datadoghq.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "common-room",
    "description": "Turn Common Room into your GTM copilot. Research accounts and contacts, prep for calls with attendee profiles and talking points, and draft personalized outreach across email, LinkedIn, and phone.",
    "servers": [
      {
        "key": "common-room",
        "url": "https://mcp.commonroom.io/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "apollo",
    "description": "Prospect, enrich leads, and load outreach sequences with Apollo.io — one-click MCP server integration for Claude Code and Cowork.",
    "servers": [
      {
        "key": "apollo",
        "url": "https://mcp.apollo.io/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "slack-by-salesforce",
    "description": "Slack integration for searching messages, sending communications, managing canvases, and more",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "bio-research",
    "description": "Connect to preclinical research tools and databases (literature search, genomics analysis, target prioritization) to accelerate early-stage life sciences R&D",
    "servers": [
      {
        "key": "pubmed",
        "url": "https://pubmed.mcp.claude.com/mcp",
        "type": "http"
      },
      {
        "key": "biorender",
        "url": "https://mcp.services.biorender.com/mcp",
        "type": "http"
      },
      {
        "key": "biorxiv",
        "url": "https://mcp.deepsense.ai/biorxiv/mcp",
        "type": "http"
      },
      {
        "key": "c-trials",
        "url": "https://mcp.deepsense.ai/clinical_trials/mcp",
        "type": "http"
      },
      {
        "key": "chembl",
        "url": "https://mcp.deepsense.ai/chembl/mcp",
        "type": "http"
      },
      {
        "key": "synapse",
        "url": "https://mcp.synapse.org/mcp",
        "type": "http"
      },
      {
        "key": "wiley",
        "url": "https://connector.scholargateway.ai/mcp",
        "type": "http"
      },
      {
        "key": "owkin",
        "url": "https://mcp.k.owkin.com/mcp",
        "type": "http"
      },
      {
        "key": "ot",
        "url": "https://mcp.platform.opentargets.org/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "sales",
    "description": "Prospect, craft outreach, and build deal strategy faster. Prep for calls, manage your pipeline, and write personalized messaging that moves deals forward.",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "hubspot",
        "url": "https://mcp.hubspot.com/anthropic",
        "type": "http"
      },
      {
        "key": "close",
        "url": "https://mcp.close.com/mcp",
        "type": "http"
      },
      {
        "key": "clay",
        "url": "https://api.clay.com/v3/mcp",
        "type": "http"
      },
      {
        "key": "zoominfo",
        "url": "https://mcp.zoominfo.com/mcp",
        "type": "http"
      },
      {
        "key": "notion",
        "url": "https://mcp.notion.com/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "fireflies",
        "url": "https://api.fireflies.ai/mcp",
        "type": "http"
      },
      {
        "key": "ms365",
        "url": "https://microsoft365.mcp.claude.com/mcp",
        "type": "http"
      },
      {
        "key": "apollo",
        "url": "https://api.apollo.io/mcp",
        "type": "http"
      },
      {
        "key": "outreach",
        "url": "https://mcp.outreach.io/mcp",
        "type": "http"
      },
      {
        "key": "similarweb",
        "url": "https://mcp.similarweb.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "legal",
    "description": "Speed up contract review, NDA triage, and compliance workflows for in-house legal teams. Draft legal briefs, organize precedent research, and manage institutional knowledge.",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "box",
        "url": "https://mcp.box.com",
        "type": "http"
      },
      {
        "key": "egnyte",
        "url": "https://mcp-server.egnyte.com/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "ms365",
        "url": "https://microsoft365.mcp.claude.com/mcp",
        "type": "http"
      },
      {
        "key": "docusign",
        "url": "https://mcp.docusign.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "product-management",
    "description": "Write feature specs, plan roadmaps, and synthesize user research faster. Keep stakeholders updated and stay ahead of the competitive landscape.",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "linear",
        "url": "https://mcp.linear.app/mcp",
        "type": "http"
      },
      {
        "key": "asana",
        "url": "https://mcp.asana.com/v2/mcp",
        "type": "http"
      },
      {
        "key": "monday",
        "url": "https://mcp.monday.com/mcp",
        "type": "http"
      },
      {
        "key": "clickup",
        "url": "https://mcp.clickup.com/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "notion",
        "url": "https://mcp.notion.com/mcp",
        "type": "http"
      },
      {
        "key": "figma",
        "url": "https://mcp.figma.com/mcp",
        "type": "http"
      },
      {
        "key": "amplitude",
        "url": "https://mcp.amplitude.com/mcp",
        "type": "http"
      },
      {
        "key": "amplitude-eu",
        "url": "https://mcp.eu.amplitude.com/mcp",
        "type": "http"
      },
      {
        "key": "pendo",
        "url": "https://app.pendo.io/mcp/v0/shttp",
        "type": "http"
      },
      {
        "key": "intercom",
        "url": "https://mcp.intercom.com/mcp",
        "type": "http"
      },
      {
        "key": "fireflies",
        "url": "https://api.fireflies.ai/mcp",
        "type": "http"
      },
      {
        "key": "similarweb",
        "url": "https://mcp.similarweb.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "productivity",
    "description": "Manage tasks, plan your day, and build up memory of important context about your work. Syncs with your calendar, email, and chat to keep everything organized and on track.",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "notion",
        "url": "https://mcp.notion.com/mcp",
        "type": "http"
      },
      {
        "key": "asana",
        "url": "https://mcp.asana.com/v2/mcp",
        "type": "http"
      },
      {
        "key": "linear",
        "url": "https://mcp.linear.app/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "ms365",
        "url": "https://microsoft365.mcp.claude.com/mcp",
        "type": "http"
      },
      {
        "key": "monday",
        "url": "https://mcp.monday.com/mcp",
        "type": "http"
      },
      {
        "key": "clickup",
        "url": "https://mcp.clickup.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "marketing",
    "description": "Create content, plan campaigns, and analyze performance across marketing channels. Maintain brand voice consistency, track competitors, and report on what's working.",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "canva",
        "url": "https://mcp.canva.com/mcp",
        "type": "http"
      },
      {
        "key": "figma",
        "url": "https://mcp.figma.com/mcp",
        "type": "http"
      },
      {
        "key": "hubspot",
        "url": "https://mcp.hubspot.com/anthropic",
        "type": "http"
      },
      {
        "key": "amplitude",
        "url": "https://mcp.amplitude.com/mcp",
        "type": "http"
      },
      {
        "key": "amplitude-eu",
        "url": "https://mcp.eu.amplitude.com/mcp",
        "type": "http"
      },
      {
        "key": "notion",
        "url": "https://mcp.notion.com/mcp",
        "type": "http"
      },
      {
        "key": "ahrefs",
        "url": "https://api.ahrefs.com/mcp/mcp",
        "type": "http"
      },
      {
        "key": "similarweb",
        "url": "https://mcp.similarweb.com",
        "type": "http"
      },
      {
        "key": "klaviyo",
        "url": "https://mcp.klaviyo.com/mcp",
        "type": "http"
      },
      {
        "key": "supermetrics",
        "url": "https://mcp.supermetrics.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "finance",
    "description": "Streamline finance and accounting workflows, from journal entries and reconciliation to financial statements and variance analysis. Speed up audit prep, month-end close, and keeping your books clean.",
    "servers": [
      {
        "key": "bigquery",
        "url": "https://bigquery.googleapis.com/mcp",
        "type": "http"
      },
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "ms365",
        "url": "https://microsoft365.mcp.claude.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "enterprise-search",
    "description": "Search across all of your company's tools in one place. Find anything across email, chat, documents, and wikis without switching between apps.",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "notion",
        "url": "https://mcp.notion.com/mcp",
        "type": "http"
      },
      {
        "key": "guru",
        "url": "https://mcp.api.getguru.com/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "asana",
        "url": "https://mcp.asana.com/v2/mcp",
        "type": "http"
      },
      {
        "key": "ms365",
        "url": "https://microsoft365.mcp.claude.com/mcp",
        "type": "http"
      }
    ]
  },
  {
    "name": "data",
    "description": "Write SQL, explore datasets, and generate insights faster. Build visualizations and dashboards, and turn raw data into clear stories for stakeholders.",
    "servers": [
      {
        "key": "bigquery",
        "url": "https://bigquery.googleapis.com/mcp",
        "type": "http"
      },
      {
        "key": "hex",
        "url": "https://app.hex.tech/mcp",
        "type": "http"
      },
      {
        "key": "amplitude",
        "url": "https://mcp.amplitude.com/mcp",
        "type": "http"
      },
      {
        "key": "amplitude-eu",
        "url": "https://mcp.eu.amplitude.com/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "definite",
        "url": "https://api.definite.app/v3/mcp/http",
        "type": "http"
      }
    ]
  },
  {
    "name": "customer-support",
    "description": "Triage tickets, draft responses, escalate issues, and build your knowledge base. Research customer context and turn resolved issues into self-service content.",
    "servers": [
      {
        "key": "slack",
        "url": "https://mcp.slack.com/mcp",
        "type": "http"
      },
      {
        "key": "intercom",
        "url": "https://mcp.intercom.com/mcp",
        "type": "http"
      },
      {
        "key": "hubspot",
        "url": "https://mcp.hubspot.com/anthropic",
        "type": "http"
      },
      {
        "key": "guru",
        "url": "https://mcp.api.getguru.com/mcp",
        "type": "http"
      },
      {
        "key": "atlassian",
        "url": "https://mcp.atlassian.com/v1/mcp",
        "type": "http"
      },
      {
        "key": "notion",
        "url": "https://mcp.notion.com/mcp",
        "type": "http"
      },
      {
        "key": "ms365",
        "url": "https://microsoft365.mcp.claude.com/mcp",
        "type": "http"
      }
    ]
  }
];

// Build managedMcpServers ARRAY (Anthropic schema) from selected plugin names.
// Schema: [{name, url, transport: "http"|"sse", oauth?: true}]
// Most enterprise SaaS MCPs require OAuth → enable PKCE auto-flow.
function buildManagedMcpServers(selectedPluginNames) {
  const set = new Set(selectedPluginNames || []);
  const out = [];
  for (const p of COWORK_PLUGINS) {
    if (!set.has(p.name)) continue;
    for (const s of p.servers) {
      const name = p.servers.length === 1 ? p.name : `${p.name}-${s.key}`;
      const transport = /\/sse(\b|\/)/i.test(s.url) ? "sse" : "http";
      out.push({ name, url: s.url, transport, oauth: true });
    }
  }
  return out;
}

module.exports = { COWORK_PLUGINS, buildManagedMcpServers };

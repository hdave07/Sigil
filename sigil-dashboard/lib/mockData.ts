import { Agent, AgentAction, AuditEvent, Mission } from "./types";

export const missions: Mission[] = [
  {
    id: "m1",
    description: "Research competitor pricing and draft a summary email",
    scope: ["web_search", "draft_email", "write_file"],
    hash: "a3f9d2e1b74c5f8a",
    createdAt: "2:28 PM",
  },
];

export const agents: Agent[] = [
  {
    id: "a1",
    name: "Research Agent",
    missionId: "m1",
    missionDescription: "Research competitor pricing and draft a summary email",
    status: "running",
    allowedActions: ["web_search", "draft_email", "write_file"],
    currentJob: "Research competitor pricing",
    startedAt: "2:28 PM",
  },
  {
    id: "a2",
    name: "Draft Helper",
    missionId: "m1",
    missionDescription: "Drafting summary email",
    status: "paused",
    allowedActions: ["web_search"],
    currentJob: "Draft summary email",
    startedAt: "2h ago",
  },
  {
    id: "a3",
    name: "Pricing Agent",
    missionId: "m1",
    missionDescription: "Scrape and compile competitor pricing data",
    status: "running",
    allowedActions: ["web_search"],
    currentJob: "Scrape pricing pages",
    startedAt: "45m ago",
  },
  {
    id: "a4",
    name: "Update Agent",
    missionId: "m1",
    missionDescription: "Send weekly stakeholder update",
    status: "paused",
    allowedActions: ["web_search"],
    currentJob: "Send stakeholder update",
    startedAt: "3h ago",
  },
];

export const actions: AgentAction[] = [
  {
    id: "act1",
    agentId: "a2",
    agentName: "Draft Helper",
    type: "send_email",
    label: "Wants to send an email",
    inBounds: false,
    status: "pending",
    missionDescription: "Drafting summary email",
    reason:
      "Draft Helper was only given permission to search the web. Sending emails was never part of its allowed list, so it paused and asked for approval.",
    payload: {
      To: "stakeholder@company.com",
      Subject: "Q3 Competitor Pricing Summary",
      Body: "Here are the findings from today's research...",
    },
    requestedAt: "2 min ago",
  },
  {
    id: "act2",
    agentId: "a4",
    agentName: "Update Agent",
    type: "send_email",
    label: "Wants to send an email",
    inBounds: false,
    status: "pending",
    missionDescription: "Sending weekly stakeholder update",
    reason:
      "The Update Agent was set up to research and draft, not to send emails directly. This was flagged as outside its original scope.",
    payload: {
      To: "team@company.com",
      Subject: "Weekly Update — Week 24",
      Body: "Here's the weekly summary of progress and next steps...",
    },
    requestedAt: "18 min ago",
  },
  {
    id: "act3",
    agentId: "a3",
    agentName: "Pricing Agent",
    type: "write_file",
    label: "Wants to save a file to /reports/",
    inBounds: false,
    status: "pending",
    missionDescription: "Compiling competitor pricing data",
    reason:
      "The Pricing Agent was only allowed to search the web. Saving files was not on its permitted list, so it stopped and asked for approval.",
    payload: { Path: "/reports/competitor-pricing-june.csv", Size: "42 KB" },
    requestedAt: "1h ago",
  },
];

export const auditLog: AuditEvent[] = [
  {
    id: "e1",
    time: "2:28 PM",
    agentName: "Research Agent",
    what: "Started a new job: research competitor pricing",
    result: "Started",
    type: "allowed",
    hash: "a3f9d2e1b74c5f8a9b2c3d4e5f6a7b8c",
    prevHash: "0000000000000000",
  },
  {
    id: "e2",
    time: "2:28 PM",
    agentName: "Draft Helper",
    what: "Searched the web for competitor pricing information",
    result: "Allowed",
    type: "allowed",
    hash: "d8e3f9a1c24b7f3e8a5b2d9c1f4e7a3b",
    prevHash: "a3f9d2e1b74c5f8a9b2c3d4e5f6a7b8c",
  },
  {
    id: "e3",
    time: "2:29 PM",
    agentName: "Draft Helper",
    what: "Tried to send an email — sending emails was never part of its allowed list",
    result: "Blocked automatically",
    type: "blocked",
    hash: "f2b1c7e38d4a9f1b6e3c5a8d2f7b4e9c",
    prevHash: "d8e3f9a1c24b7f3e8a5b2d9c1f4e7a3b",
  },
  {
    id: "e4",
    time: "2:30 PM",
    agentName: "Draft Helper",
    what: "Paused and notified via Slack and email to ask for permission",
    result: "Waiting for you",
    type: "paused",
    hash: "e9a3d4f17b2c8e5a3f9d1b6c4e7a2f8d",
    prevHash: "f2b1c7e38d4a9f1b6e3c5a8d2f7b4e9c",
  },
];

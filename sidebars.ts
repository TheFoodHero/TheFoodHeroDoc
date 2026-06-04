import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  documentationSidebar: [
    {
      type: 'category',
      label: 'Services',
      items: [
        'services/auth-service',
        'services/payment-service',
        'services/chat-service'
      ],
    },
    {
      type: 'category',
      label: 'Linux Notes',
      items: [
        'linux/clearing-memory',
      ],
    },
  ],
  tutorialSidebar: [
    {
      type: 'category',
      label: 'Tutorial Basics',
      items: [
        'tutorials/tutorial-basics/congratulations',
        'tutorials/tutorial-basics/create-a-blog-post',
        'tutorials/tutorial-basics/create-a-document',
        'tutorials/tutorial-basics/create-a-page',
        'tutorials/tutorial-basics/deploy-your-site',
        'tutorials/tutorial-basics/markdown-features'
      ],
    },
    {
      type: 'category',
      label: 'Tutorial Extras',
      items: [
        'tutorials/tutorial-extras/manage-docs-versions',
        'tutorials/tutorial-extras/translate-your-site'
      ],
    },
  ],
  learningSidebar: [
    {
      type: 'category',
      label: 'Software Patterns',
      items: [
        'learnings/software-patterns/saga-pattern'
      ],
    },
    {
      type: 'category',
      label: 'Tests',
      items: [
        'learnings/tests/event-driven-int-test'
      ],
    }
  ],
};

export default sidebars;

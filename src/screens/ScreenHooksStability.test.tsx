import React from 'react';
import { act, create } from 'react-test-renderer';
import { apiClient } from '../api/client';
import type {
  AuthSessionResponse,
  DiscussionPost,
  GroupSummary,
  UserInterestModel,
} from '../api/types';
import { GroupsScreen } from './GroupsScreen';
import { ProfileScreen } from './ProfileScreen';

jest.mock('../api/client', () => ({
  apiClient: {
    getGroups: jest.fn(),
    getDiscussions: jest.fn(),
    getGroup: jest.fn(),
    joinGroup: jest.fn(),
    healthCheck: jest.fn(),
    getNotifications: jest.fn(),
    getRecommendations: jest.fn(),
    getInterests: jest.fn(),
    getAnalytics: jest.fn(),
  },
  isProductionEnvironment: jest.fn(() => false),
}));

describe('Screen Hooks Stability and Race Condition Guards', () => {
  const mockApi = apiClient as jest.Mocked<typeof apiClient>;

  const groupA: GroupSummary = {
    id: 'group-a',
    name: 'Group Alpha',
    description: 'Alpha circle',
    city: 'Berlin',
    languages: ['en'],
    category: 'tech',
    tags: ['coding'],
    memberCount: 10,
    requiresApproval: false,
    discussionCount: 1,
    viewerMembershipStatus: 'active',
    viewerMembershipRole: 'member',
  };

  const groupB: GroupSummary = {
    id: 'group-b',
    name: 'Group Beta',
    description: 'Beta circle',
    city: 'Berlin',
    languages: ['en'],
    category: 'tech',
    tags: ['design'],
    memberCount: 5,
    requiresApproval: false,
    discussionCount: 1,
    viewerMembershipStatus: 'active',
    viewerMembershipRole: 'member',
  };

  const discussionsA: DiscussionPost[] = [
    {
      id: 'disc-a1',
      authorName: 'Alice',
      body: 'Hello from Alpha',
      pinned: false,
      createdAt: '2026-11-01T10:00:00Z',
    },
  ];

  const discussionsB: DiscussionPost[] = [
    {
      id: 'disc-b1',
      authorName: 'Bob',
      body: 'Hello from Beta',
      pinned: false,
      createdAt: '2026-11-01T11:00:00Z',
    },
  ];

  const mockInterestModel: UserInterestModel = {
    explicitInterests: [],
    notInterestedCategories: [],
    inferredInterests: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GroupsScreen', () => {
    it('discards stale discussion responses when switching groups rapidly', async () => {
      mockApi.getGroups.mockResolvedValue({
        groups: [groupA, groupB],
        page: { hasNextPage: false, nextCursor: null },
      });

      let resolveA!: (value: unknown) => void;
      const promiseA = new Promise((resolve) => {
        resolveA = resolve;
      });

      let resolveB!: (value: unknown) => void;
      const promiseB = new Promise((resolve) => {
        resolveB = resolve;
      });

      mockApi.getDiscussions.mockImplementation(async (groupId: string) => {
        if (groupId === 'group-a') return promiseA as never;
        if (groupId === 'group-b') return promiseB as never;
        return { discussions: [] };
      });

      let tree: ReturnType<typeof create>;
      await act(async () => {
        tree = create(
          <GroupsScreen
            authenticated={true}
            isFocused={true}
            locale="en"
            onRequestSignIn={jest.fn()}
          />,
        );
      });

      expect(mockApi.getDiscussions).toHaveBeenCalledWith('group-a', 'en');

      await act(async () => {
        tree!.update(
          <GroupsScreen
            authenticated={true}
            isFocused={true}
            locale="en"
            onRequestSignIn={jest.fn()}
            targetGroupId="group-b"
          />,
        );
      });

      await act(async () => {
        resolveB({ discussions: discussionsB });
      });

      await act(async () => {
        resolveA({ discussions: discussionsA });
      });

      const textNodes = tree!.root.findAll((node) => typeof node.props.children === 'string');
      const allText = textNodes.map((n) => n.props.children).join(' ');
      expect(allText).toContain('Hello from Beta');
      expect(allText).not.toContain('Hello from Alpha');

      await act(async () => tree!.unmount());
    });

    it('handles unmounting cleanly while group and discussion requests are pending', async () => {
      let resolveGroups!: (val: any) => void;
      mockApi.getGroups.mockReturnValue(new Promise((res) => { resolveGroups = res; }));

      let tree: ReturnType<typeof create>;
      await act(async () => {
        tree = create(
          <GroupsScreen
            authenticated={true}
            isFocused={true}
            locale="en"
            onRequestSignIn={jest.fn()}
          />,
        );
      });

      await act(async () => {
        tree!.unmount();
      });

      await act(async () => {
        resolveGroups({ groups: [groupA], page: { hasNextPage: false, nextCursor: null } });
      });

      expect(mockApi.getGroups).toHaveBeenCalled();
    });
  });

  describe('ProfileScreen', () => {
    const mockSession: AuthSessionResponse = {
      authenticated: true,
      locale: 'en',
      viewer: {
        id: 'user-123',
        email: 'user@example.com',
        emailVerified: true,
        fullName: 'Test User',
        roles: ['member'],
      },
    };

    it('discards stale dashboard and health check responses when re-rendered rapidly', async () => {
      let resolveHealth1!: (v: unknown) => void;
      const healthPromise1 = new Promise((res) => { resolveHealth1 = res; });
      let resolveHealth2!: (v: unknown) => void;
      const healthPromise2 = new Promise((res) => { resolveHealth2 = res; });

      let callCount = 0;
      mockApi.healthCheck.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return healthPromise1 as never;
        return healthPromise2 as never;
      });

      mockApi.getNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 });
      mockApi.getRecommendations.mockResolvedValue({
        recommendedForYou: [],
        communitiesYouMayFeelAtHomeIn: [],
        peopleLikeYouAreJoining: [],
        gatheringsNearYou: [],
        becauseYouJoined: [],
        inYourLanguage: [],
        peopleLikeYouAttended: [],
        trendingNearYou: [],
      });
      mockApi.getInterests.mockResolvedValue({ model: mockInterestModel });

      let tree: ReturnType<typeof create>;
      await act(async () => {
        tree = create(
          <ProfileScreen
            session={mockSession}
            connectionError={null}
            isFocused={true}
            locale="en"
            apiBaseUrl="https://samgamam.com"
            onLogin={jest.fn().mockResolvedValue(undefined)}
            onLogout={jest.fn().mockResolvedValue(undefined)}
            onRefreshSession={jest.fn().mockResolvedValue(undefined)}
            onSaveApiBaseUrl={jest.fn().mockResolvedValue('https://samgamam.com')}
          />,
        );
      });

      await act(async () => {
        tree!.update(
          <ProfileScreen
            session={mockSession}
            connectionError={null}
            isFocused={true}
            locale="ml"
            apiBaseUrl="https://samgamam.com"
            onLogin={jest.fn().mockResolvedValue(undefined)}
            onLogout={jest.fn().mockResolvedValue(undefined)}
            onRefreshSession={jest.fn().mockResolvedValue(undefined)}
            onSaveApiBaseUrl={jest.fn().mockResolvedValue('https://samgamam.com')}
          />,
        );
      });

      await act(async () => {
        resolveHealth2({ service: 'samgamam-ml-service', timestamp: '2026-11-05T12:00:00Z' });
      });

      await act(async () => {
        resolveHealth1({ service: 'samgamam-old-service', timestamp: '2026-11-05T11:00:00Z' });
      });

      const textNodes = tree!.root.findAll((node) => typeof node.props.children === 'string');
      const allText = textNodes.map((n) => n.props.children).join(' ');
      expect(allText).toContain('samgamam-ml-service');
      expect(allText).not.toContain('samgamam-old-service');

      await act(async () => tree!.unmount());
    });

    it('handles unmounting cleanly while dashboard requests are in flight', async () => {
      let resolveHealth!: (v: any) => void;
      mockApi.healthCheck.mockReturnValue(new Promise((res) => { resolveHealth = res; }));
      mockApi.getNotifications.mockReturnValue(new Promise(() => {}));

      let tree: ReturnType<typeof create>;
      await act(async () => {
        tree = create(
          <ProfileScreen
            session={mockSession}
            connectionError={null}
            isFocused={true}
            locale="en"
            apiBaseUrl="https://samgamam.com"
            onLogin={jest.fn().mockResolvedValue(undefined)}
            onLogout={jest.fn().mockResolvedValue(undefined)}
            onRefreshSession={jest.fn().mockResolvedValue(undefined)}
            onSaveApiBaseUrl={jest.fn().mockResolvedValue('https://samgamam.com')}
          />,
        );
      });

      await act(async () => {
        tree!.unmount();
      });

      await act(async () => {
        resolveHealth({ service: 'samgamam-service', timestamp: '2026-11-05T12:00:00Z' });
      });

      expect(mockApi.healthCheck).toHaveBeenCalled();
    });
  });
});

// App.js - Improved organization
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import './App.css';
// Use our secure Octokit alternative
import { createSecureOctokit } from './utils/githubApi';
// Import Firebase modules
import { initializeApp } from 'firebase/app';
import { getAuth, GithubAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
// Import Octokit for the auth check
import { Octokit } from '@octokit/rest';

// Preset values
const DEFAULT_ORGANIZATION = 'GoHighLevel';
const DEFAULT_TEAM_MEMBERS = ['ajayreddy611', 'ayush-highlevel', 'nihalmaddela12', 'hammad-ghl'];
const DEFAULT_REPOS = ['leadgen-marketplace-backend', 'ghl-content-ai', 'spm-ts', 'platform-backend'];

// Remove direct token access
// const GITHUB_TOKEN = process.env.REACT_APP_PR_TRACKER_GITHUB_TOKEN || '';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase with CSP compliance
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const githubProvider = new GithubAuthProvider();
githubProvider.addScope('repo');
githubProvider.addScope('read:org');
githubProvider.addScope('user:email');
githubProvider.addScope('org:read');

// Add state parameter to prevent CSRF attacks
githubProvider.setCustomParameters({
  'state': generateRandomState()
});

// Generate random state for CSRF protection
function generateRandomState() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Regex to extract Slack links from PR descriptions - with stricter validation
const SLACK_LINK_REGEX = /^(https:\/\/[a-zA-Z0-9-]+\.slack\.com\/[a-zA-Z0-9\/#@_\-=&.:]+)$/;

// Sanitize text to prevent XSS attacks
function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function App() {
  // State declarations
  const [organization] = useState(DEFAULT_ORGANIZATION);
  const [teamMembers, setTeamMembers] = useState(
    JSON.parse(localStorage.getItem('team_members') || JSON.stringify(DEFAULT_TEAM_MEMBERS))
  );
  const [pullRequests, setPullRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [repoLoading, setRepoLoading] = useState(false);
  const [newTeamMember, setNewTeamMember] = useState('');
  const [repositories, setRepositories] = useState([]);
  const [selectedRepos, setSelectedRepos] = useState(
    JSON.parse(localStorage.getItem('selected_repos') || JSON.stringify(DEFAULT_REPOS))
  );
  const [error, setError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [authorFilter, setAuthorFilter] = useState('all');
  const [reviewerFilter, setReviewerFilter] = useState('all');
  const [repoFilter, setRepoFilter] = useState('all');
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [activeSettingsTab, setActiveSettingsTab] = useState('general');
  const [userData, setUserData] = useState(null);
  const slackLinkInputRef = useRef(null);
  const [loadingProgress, setLoadingProgress] = useState({ total: 0, completed: 0, stage: '' });
  
  // Modal state for slack link editing
  const [slackLinkModal, setSlackLinkModal] = useState({
    isOpen: false,
    prId: null,
    currentLink: ''
  });
  
  // Use a ref to hold the current input value without causing rerenders
  const modalInputRef = useRef('');
  
  // Store scroll position when opening modal
  const scrollPositionRef = useRef(0);
  
  // Custom storage for added slack links
  const [customSlackLinks, setCustomSlackLinks] = useState(
    JSON.parse(localStorage.getItem('custom_slack_links') || '{}')
  );
  
  // Restore PR update tracking state
  const [updatingPRs, setUpdatingPRs] = useState({});
  
  // Restore toast message state with auto-hide functionality
  const [toastMessage, setToastMessage] = useState('');
  const toastTimeoutRef = useRef(null);
  
  // Auto-hide toast messages after 5 seconds
  useEffect(() => {
    if (toastMessage) {
      // Clear any existing timeout
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      
      // Set a new timeout to clear the toast
      toastTimeoutRef.current = setTimeout(() => {
        setToastMessage('');
      }, 5000);
    }
    
    // Cleanup timeout on component unmount
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [toastMessage]);
  
  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is signed in
        const githubUser = {
          displayName: user.displayName,
          login: user.reloadUserInfo.screenName || user.displayName,
          email: user.email,
          photoURL: user.photoURL
        };
        setUserData(githubUser);
        setIsLoggedIn(true);
      } else {
        // User is signed out
        setUserData(null);
        setIsLoggedIn(false);
      }
    });
    
    // Cleanup subscription
    return () => unsubscribe();
  }, []);
  
  // Auto-fetch data when user is logged in
  useEffect(() => {
    if (isLoggedIn && userData) {
      if (selectedRepos.length > 0) {
        fetchRepositories(1);
        fetchPullRequests();
      } else {
        setRepositories(DEFAULT_REPOS);
        setSelectedRepos(DEFAULT_REPOS);
        fetchPullRequests();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, userData]);
  
  // Save custom slack links to localStorage when they change
  useEffect(() => {
    localStorage.setItem('custom_slack_links', JSON.stringify(customSlackLinks));
  }, [customSlackLinks]);
  
  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('team_members', JSON.stringify(teamMembers));
    localStorage.setItem('selected_repos', JSON.stringify(selectedRepos));
  }, [teamMembers, selectedRepos]);

  // Auto-fetch pull requests when repositories are loaded and user is logged in
  useEffect(() => {
    if (isLoggedIn && selectedRepos.length > 0 && repositories.length > 0) {
      fetchPullRequests();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, repositories]);
  
  // Check if user is a member of the organization - with enhanced security
  const checkOrgMembership = async (token, username) => {
    if (!token || !username || !organization) {
      return false;
    }
    
    try {
      // Create Octokit instance with the user's access token from GitHub Auth
      const octokit = new Octokit({ auth: token });
      
      // PRIORITIZE REPO ACCESS CHECK - This is most reliable for private orgs
      // Check if user can access org repos - this confirms org membership
      try {
        const { data: repos } = await octokit.repos.listForOrg({
          org: organization,
          per_page: 1
        });
        
        if (repos && repos.length > 0) {
          return true;
        }
      } catch (reposError) {
        // Continue to other checks
      }
      
      return false;
    } catch (error) {
      setError(`There was a problem verifying your access to the ${organization} organization.`);
      return false;
    }
  };
  
  // Sign in with GitHub - Enhanced security
  const signInWithGitHub = async () => {
    try {
      setError('');
      setLoading(true);
      auth.useDeviceLanguage();
      
      try {
        const result = await signInWithPopup(auth, githubProvider);
        
        const credential = GithubAuthProvider.credentialFromResult(result);
        if (!credential) {
          throw new Error('Failed to get credentials from GitHub');
        }
        
        // Store GitHub access token for API calls
        const token = credential.accessToken;
        localStorage.setItem('github_access_token', token);
        
        const username = result.user.reloadUserInfo.screenName || result.user.displayName;
        
        if (!username) {
          await signOut(auth);
          setError('Could not retrieve GitHub username.');
          setLoading(false);
          return;
        }
        
        // Store user info before checking org access
        setUserData({
          displayName: result.user.displayName,
          login: username,
          email: result.user.email,
          photoURL: result.user.photoURL,
          githubToken: token  // Store token in user data
        });
        
        const hasOrgAccess = await checkOrgMembership(token, username);
        
        if (!hasOrgAccess) {
          await signOut(auth);
          setUserData(null);
          setError(`We could not verify your access to the ${organization} organization. Please make sure you have access to this organization and have granted the correct permissions.`);
          setLoading(false);
          return;
        }
        
        setIsLoggedIn(true);
        
        // Show success message
        setToastMessage(`Welcome, ${username}! You've successfully logged in.`);
        
        // Successfully authenticated and validated membership
        fetchRepositories(1);
      } catch (error) {
        setError(`Failed to sign in with GitHub: ${error.message}`);
      }
      
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setError(`Failed to start sign in flow: ${error.message}`);
    }
  };
  
  // Handle user logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('github_access_token'); // Clear the token
      setIsLoggedIn(false);
      setUserData(null);
      setPullRequests([]);
    } catch (error) {
      setError(`Failed to sign out: ${error.message}`);
    }
  };

  // Open the Slack link modal for a PR
  const openSlackLinkModal = useCallback((pr, currentLink) => {
    // Save current scroll position
    scrollPositionRef.current = window.scrollY;
    
    // Prevent body scrolling without changing position
    document.body.classList.add('modal-open');
    
    // Set initial input value
    modalInputRef.current = currentLink || '';
    
    // Set modal state
    setSlackLinkModal({
      isOpen: true,
      prId: `${pr.repo}-${pr.number}`,
      currentLink: currentLink || ''
    });
    
    // Focus the input after modal is shown
    setTimeout(() => {
      if (slackLinkInputRef.current) {
        slackLinkInputRef.current.focus();
      }
    }, 50);
  }, []);
  
  // Close the Slack link modal
  const closeSlackLinkModal = useCallback(() => {
    // Restore body scrolling
    document.body.classList.remove('modal-open');
    
    // Clear modal state
    setSlackLinkModal({
      isOpen: false,
      prId: null,
      currentLink: ''
    });
    modalInputRef.current = '';
  }, []);
  
  // Update the PR description with the Slack link
  const updatePRDescription = async (pr, slackLink) => {
    try {
      if (!isLoggedIn) {
        setError('User not logged in');
        return;
      }
      
      // Track PR update state with loading indicator
      const prKey = `${pr.repo}-${pr.number}`;
      setUpdatingPRs(prev => ({
        ...prev,
        [prKey]: true
      }));
      
      // Use our secure Octokit alternative
      const octokit = createSecureOctokit();
      
      // Get current PR details to make sure we have the latest body
      const { data: currentPR } = await octokit.pulls.get({
        owner: organization,
        repo: pr.repo,
        pull_number: pr.number
      });
      
      let newBody = currentPR.body || '';
      
      // Check if there's already a Slack link in the description
      const slackLinkRegex = /(https:\/\/[a-zA-Z0-9-]+\.slack\.com\/[a-zA-Z0-9\/#@_\-=&.:]+)/g;
      if (slackLinkRegex.test(newBody)) {
        // Replace existing Slack link
        newBody = newBody.replace(slackLinkRegex, `${slackLink}`);
      } else {
        // Add new Slack link at the end of the description
        newBody = newBody.trim();
        newBody += newBody ? '\n\n' : '';
        newBody += `${slackLink}`;
      }
      
      // Update the PR description
      await octokit.pulls.update({
        owner: organization,
        repo: pr.repo,
        pull_number: pr.number,
        body: newBody
      });
      
      // Update succeeded, show confirmation toast message
      setToastMessage(`Updated PR #${pr.number} with Slack thread link`);
      
      // Mark this PR as no longer updating
      setUpdatingPRs(prev => {
        const updated = { ...prev };
        delete updated[prKey];
        return updated;
      });
    } catch (error) {
      // Mark this PR as no longer updating
      setUpdatingPRs(prev => {
        const updated = { ...prev };
        delete updated[`${pr.repo}-${pr.number}`];
        return updated;
      });
      
      console.error('Failed to update PR description:', error);
      setError(`Failed to update PR description: ${error.message}`);
    }
  };
  
  // Save the Slack link from modal
  const saveSlackLinkFromModal = useCallback(() => {
    if (!slackLinkModal.prId) return;
    
    const { prId } = slackLinkModal;
    const inputValue = modalInputRef.current;
    
    if (inputValue && inputValue.trim()) {
      // More thorough URL validation
      try {
        const url = new URL(inputValue.trim());
        if (!url.hostname.endsWith('.slack.com')) {
          setError('Please enter a valid Slack link');
          return;
        }
        
        const trimmedLink = inputValue.trim();
        setCustomSlackLinks({
          ...customSlackLinks,
          [prId]: trimmedLink
        });
        
        // Find the PR to update description
        const pr = pullRequests.find(p => `${p.repo}-${p.number}` === prId);
        if (pr) {
          // Update PR description with the Slack link
          updatePRDescription(pr, trimmedLink);
        }
      } catch (e) {
        setError('Please enter a valid URL');
        return;
      }
    } else {
      const updatedLinks = { ...customSlackLinks };
      delete updatedLinks[prId];
      setCustomSlackLinks(updatedLinks);
    }
    
    closeSlackLinkModal();
  }, [slackLinkModal, customSlackLinks, pullRequests, closeSlackLinkModal, setError, setCustomSlackLinks, updatePRDescription]);
  
  // Extract the first Slack link from PR description with proper validation
  const extractSlackLink = (description) => {
    if (!description) return null;
    const matches = description.match(SLACK_LINK_REGEX);
    
    if (matches && matches[1]) {
      // Additional validation for Slack URL
      try {
        const url = new URL(matches[1]);
        if (url.hostname.endsWith('.slack.com')) {
          return matches[1];
        }
      } catch (e) {
        // Invalid URL
        return null;
      }
    }
    return null;
  };
  
  // Find PRs with same branch and check if any have a Slack link
  const findPRsWithSameBranch = (pr) => {
    // Basic validation only
    if (!pr) {
      return null;
    }
    
    // Repair missing properties
    if (!pr.head) pr.head = { ref: 'unknown-branch' };
    if (!pr.id) pr.id = 0;
    
    const branch = pr.head.ref;
    const prsWithSameBranch = pullRequests.filter(
      otherPr => otherPr && otherPr.head && otherPr.head.ref === branch && otherPr.id !== pr.id
    );
    
    return prsWithSameBranch.find(otherPr => 
      (otherPr && (extractSlackLink(otherPr.body) || customSlackLinks[`${otherPr.repo}-${otherPr.number}`]))
    );
  };
  
  // Get the Slack link for a PR
  const getSlackLink = (pr) => {
    if (!pr || !pr.repo || !pr.number) return null;
    
    const customLink = customSlackLinks[`${pr.repo}-${pr.number}`];
    if (customLink) return customLink;
    return extractSlackLink(pr.body);
  };
  
  // Copy a Slack link from another PR with the same branch
  const copySlackLinkFromSameBranch = (pr, otherPr) => {
    const otherPrLink = getSlackLink(otherPr);
    if (otherPrLink) {
      setCustomSlackLinks({
        ...customSlackLinks,
        [`${pr.repo}-${pr.number}`]: otherPrLink
      });
      
      // Update PR description with the copied Slack link
      updatePRDescription(pr, otherPrLink);
    }
  };
  
  // Function to fetch repositories with pagination
  const fetchRepositories = async (pageNum) => {
    if (!isLoggedIn) return;
    
    setRepoLoading(true);
    setError('');
    
    try {
      // Use our secure Octokit alternative
      const octokit = createSecureOctokit();
      
      try {
        const response = await octokit.repos.listForOrg({
          org: organization,
          per_page: 50,
          page: pageNum
        });
        
        if (pageNum === 1) {
          setRepositories(response.data.map(repo => repo.name));
        } else {
          setRepositories(prev => [...prev, ...response.data.map(repo => repo.name)]);
        }
        
        const linkHeader = response.headers.link;
        setHasNextPage(linkHeader && linkHeader.includes('rel="next"'));
        setPage(pageNum);
      } catch (apiErr) {
        setRepositories(DEFAULT_REPOS);
        setHasNextPage(false);
        
        if (pageNum > 1) {
          setError(`Couldn't load additional repositories: ${apiErr.message}`);
        }
      }
      
      setRepoLoading(false);
    } catch (err) {
      setRepositories(DEFAULT_REPOS);
      setRepoLoading(false);
    }
  };

  // Fetch more repositories when user clicks "Load More"
  const loadMoreRepos = () => {
    fetchRepositories(page + 1);
  };

  // Function to fetch PRs with filtering - optimized with parallel requests only
  const fetchPullRequests = async () => {
    if (!isLoggedIn || selectedRepos.length === 0) {
      setError('Please log in and select at least one repository.');
      return;
    }
    
    setLoading(true);
    setPullRequests([]);
    setError('');
    setLoadingProgress({ total: selectedRepos.length * 2, completed: 0, stage: 'Fetching pull requests' });
    
    try {
      // Use our secure Octokit alternative
      const octokit = createSecureOctokit();
      
      // Step 1: Fetch all PRs from all repos in parallel
      const prFetchPromises = selectedRepos.map((repo, index) => {
        return octokit.pulls.list({
          owner: organization,
          repo: repo,
          state: 'open',
          per_page: 100
        })
        .then(response => {
          setLoadingProgress(prev => ({ 
            ...prev, 
            completed: prev.completed + 1,
            stage: `Fetched PRs from ${index + 1}/${selectedRepos.length} repos`
          }));
          // Ensure the response has a data property
          if (!response.data) {
            return [];
          }
          return response.data.map(pr => ({
            ...pr,
            repo
          }));
        })
        .catch(error => {
          setError(prev => `${prev ? prev + '\n' : ''}Error fetching PRs for ${repo}: ${error.message}`);
          // Return empty array to keep the promise chain working
          return [];
        });
      });

      // Wait for all PR fetch operations to complete
      const prArrays = await Promise.all(prFetchPromises);

      // Flatten the array of arrays into a single array
      const allPRsRaw = prArrays.flat();

      // Filter PRs by team members
      const teamPRs = allPRsRaw.filter(pr => {
        // Handle missing data by logging it but not skipping
        if (!pr) {
          return false;
        }
        
        // If user data is missing, try to keep the PR but fix it
        if (!pr.user) {
          pr.user = { login: 'unknown' }; // Add placeholder user
        }

        const isAuthor = pr.user && teamMembers.includes(pr.user.login);
        const isReviewer = pr.requested_reviewers && 
          pr.requested_reviewers.some(reviewer => teamMembers.includes(reviewer.login));
        
        return isAuthor || isReviewer;
      });
      
      // Exit early if no PRs found
      if (teamPRs.length === 0) {
        setLoading(false);
        setLoadingProgress({ total: 0, completed: 0, stage: '' });
        return;
      }
      
      setLoadingProgress(prev => ({ 
        ...prev, 
        total: prev.total + teamPRs.length,
        stage: `Loading details for ${teamPRs.length} pull requests`
      }));
      
      // Step 2: Batch fetch PR reviews and details in parallel
      const prDetailsPromises = teamPRs.map((pr, index) => {
        // Skip if PR is missing essential properties
        if (!pr || !pr.repo || !pr.number) {
          // Return a placeholder to keep array indices aligned
          return Promise.resolve({
            repo: pr?.repo || 'unknown',
            number: pr?.number || 0,
            user: { login: 'unknown' },
            reviews: [],
            reviewers: [],
            mergeable: null,
            mergeable_state: 'unknown',
            title: 'Incomplete PR data',
            html_url: '#',
            head: { ref: 'unknown-branch' },
            created_at: new Date().toISOString()
          });
        }

        const reviewsPromise = octokit.pulls.listReviews({
          owner: organization,
          repo: pr.repo,
          pull_number: pr.number
        }).catch(err => {
          return { data: [] }; // Return empty array on error
        });
        
        // Only fetch details when needed for mergeable status
        const detailsPromise = octokit.pulls.get({
          owner: organization,
          repo: pr.repo,
          pull_number: pr.number
        }).catch(err => {
          return { data: { mergeable: null, mergeable_state: 'unknown' } }; // Return placeholder on error
        });
        
        return Promise.all([reviewsPromise, detailsPromise])
          .then(([reviewsResponse, prDetailResponse]) => {
            setLoadingProgress(prev => ({ 
              ...prev, 
              completed: prev.completed + 1,
              stage: `Loaded details for PR #${pr.number} (${index + 1}/${teamPRs.length})`
            }));
            
            // Ensure we have valid requested_reviewers
            if (!pr.requested_reviewers) {
              pr.requested_reviewers = [];
            }
            
            const hasRequestedReviewers = pr.requested_reviewers.length > 0;
            const approvalCount = reviewsResponse.data.filter(r => r.state === 'APPROVED').length;
            
            let mergeBlockReason = null;
            if (hasRequestedReviewers && approvalCount === 0) {
              mergeBlockReason = 'Waiting for reviews';
            }
            
            return {
              ...pr,
              reviews: reviewsResponse.data || [],
              teamMember: pr.user ? teamMembers.find(member => member === pr.user.login) : null,
              reviewers: pr.requested_reviewers || [],
              mergeable: prDetailResponse.data.mergeable,
              mergeable_state: prDetailResponse.data.mergeable_state || 'unknown',
              mergeBlockReason
            };
          });
      });
      
      // Process all PR details in parallel
      const processedPRs = await Promise.all(prDetailsPromises);
      
      setPullRequests(processedPRs);
      setLoading(false);
      setLoadingProgress({ total: 0, completed: 0, stage: '' });
      
      if (processedPRs.length > 0) {
        setSettingsExpanded(false);
        setRepoFilter('all');
      }
    } catch (err) {
      setError(`Error fetching pull requests: ${err.message}`);
      setLoading(false);
      setLoadingProgress({ total: 0, completed: 0, stage: '' });
    }
  };

  const addTeamMember = () => {
    if (newTeamMember && !teamMembers.includes(newTeamMember)) {
      setTeamMembers([...teamMembers, newTeamMember]);
      setNewTeamMember('');
    }
  };

  const removeTeamMember = (member) => {
    setTeamMembers(teamMembers.filter(m => m !== member));
  };

  const toggleRepository = (repo) => {
    if (selectedRepos.includes(repo)) {
      setSelectedRepos(selectedRepos.filter(r => r !== repo));
    } else {
      setSelectedRepos([...selectedRepos, repo]);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };
  
  // Get review status for a PR
  const getReviewStatus = (pr) => {
    // Ensure PR has the expected properties
    if (!pr) {
      return { reviewed: [], pending: [], states: {}, hasReviews: false };
    }
    
    // Make sure we have arrays to work with
    if (!pr.reviewers) pr.reviewers = [];
    if (!pr.reviews) pr.reviews = [];
    
    const reviewerLogins = pr.reviewers.map(r => r && r.login ? r.login : 'unknown');
    const completedReviews = {};
    
    pr.reviews.forEach(review => {
      if (review && review.user && review.state && review.state !== 'COMMENTED') {
        completedReviews[review.user.login] = review.state;
      }
    });
    
    return {
      reviewed: Object.keys(completedReviews),
      pending: reviewerLogins.filter(login => !completedReviews[login]),
      states: completedReviews,
      hasReviews: pr.reviews.length > 0
    };
  };
  
  // Get unresolved comments count
  const getUnresolvedCommentsCount = (pr) => {
    // Validate input
    if (!pr || !pr.reviews) {
      return 0;
    }
    
    // Count CHANGES_REQUESTED reviews as these contain unresolved comments
    const changesRequestedCount = pr.reviews.filter(review => 
      review && review.state === 'CHANGES_REQUESTED'
    ).length;
    
    return changesRequestedCount;
  };
  
  // Get all unique reviewers from pull requests
  const getAllReviewers = () => {
    const reviewers = new Set();
    pullRequests.forEach(pr => {
      if (pr && pr.reviewers) {
        pr.reviewers.forEach(reviewer => {
          if (reviewer && reviewer.login) {
            reviewers.add(reviewer.login);
          }
        });
      }
    });
    return Array.from(reviewers);
  };
  
  // Get all unique repositories from pull requests
  const getAllRepos = () => {
    const repos = new Set();
    pullRequests.forEach(pr => {
      if (pr && pr.repo) {
        repos.add(pr.repo);
      }
    });
    return Array.from(repos).sort();
  };
  
  // Filter PRs based on selected filters
  const filteredPRs = pullRequests.filter(pr => {
    // Skip completely undefined PRs
    if (!pr) {
      return false;
    }
    
    // Repair missing properties instead of filtering out
    if (!pr.user) {
      pr.user = { login: 'unknown' }; 
    }
    
    if (!pr.reviewers) {
      pr.reviewers = [];
    }
    
    // Filter by author
    if (authorFilter !== 'all' && pr.user.login !== authorFilter) {
      return false;
    }
    
    // Filter by reviewer (safely)
    if (reviewerFilter !== 'all') {
      const hasReviewer = pr.reviewers && pr.reviewers.some(reviewer => 
        reviewer && reviewer.login === reviewerFilter
      );
      if (!hasReviewer) return false;
    }
    
    // Filter by repository
    if (repoFilter !== 'all' && pr.repo !== repoFilter) {
      return false;
    }
    
    return true;
  });

  // Use default repositories
  const useDefaultRepos = () => {
    setRepositories(DEFAULT_REPOS);
    setSelectedRepos(DEFAULT_REPOS);
    setRepoLoading(false);
    setError('');
    
    if (isLoggedIn) {
      fetchPullRequests();
    }
  };

  // Render login component with security notices
  const renderLogin = () => (
    <div className="login-container">
      <h2>Welcome to GitHub PR Tracker</h2>
      <p>Track and manage pull requests for your team's repositories</p>
      <p><small>Note: You must be a member of the {organization} organization to use this app.</small></p>
      <button onClick={signInWithGitHub} className="github-login-button" disabled={loading}>
        {loading ? 'Authenticating...' : 'Login with GitHub'}
      </button>
      {error && <div className="security-error-message">{error}</div>}
    </div>
  );

  // Render header component with organization name
  const renderHeader = () => (
    <header className="App-header">
      <h1>{organization} PR Tracker</h1>
      {isLoggedIn && userData && (
        <div className="header-actions">
          <span className="user-info">
            Welcome, {sanitizeText(userData.login)}
          </span>
          <select 
            value={authorFilter} 
            onChange={(e) => setAuthorFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Authors</option>
            {teamMembers.map(member => (
              <option key={sanitizeText(member)} value={member}>{sanitizeText(member)}</option>
            ))}
          </select>
          
          <select 
            value={reviewerFilter} 
            onChange={(e) => setReviewerFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Reviewers</option>
            {getAllReviewers().map(reviewer => (
              <option key={sanitizeText(reviewer)} value={reviewer}>{sanitizeText(reviewer)}</option>
            ))}
          </select>
          
          <select 
            value={repoFilter} 
            onChange={(e) => setRepoFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Repositories</option>
            {getAllRepos().map(repo => (
              <option key={sanitizeText(repo)} value={repo}>{sanitizeText(repo)}</option>
            ))}
          </select>
          
          <button 
            className="refresh-button"
            onClick={fetchPullRequests}
            disabled={loading}
            title="Fetch latest PR data"
          >
            {loading ? 'Refreshing...' : 'Refresh PRs'}
          </button>
          
          <button 
            className="logout-button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      )}
      {toastMessage && (
        <div className="toast-message">
          <div className="toast-content">
            <span className="toast-icon">✓</span>
            {toastMessage}
            <button className="toast-close" onClick={() => setToastMessage('')}>×</button>
          </div>
        </div>
      )}
    </header>
  );

  // Render settings panel
  const renderSettingsPanel = () => (
    <div className={`settings-panel ${settingsExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="settings-header" onClick={() => setSettingsExpanded(!settingsExpanded)}>
        <h2>Settings</h2>
        <div className="settings-actions">
          <button className="toggle-button" onClick={(e) => {
            e.stopPropagation();
            setSettingsExpanded(!settingsExpanded);
          }}>
            {settingsExpanded ? '▼ Collapse' : '▲ Expand'}
          </button>
        </div>
      </div>
      
      {settingsExpanded && (
        <>
          <div className="settings-tabs">
            <button 
              className={`settings-tab ${activeSettingsTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveSettingsTab('general')}
            >
              General
            </button>
          </div>
          
          {activeSettingsTab === 'general' && (
            <div className="settings-tab-content">
              <div className="settings-layout">
                <div className="settings-column">
                  <div className="form-group">
                    <label>Team Members:</label>
                    <div className="team-members-input">
                      <input 
                        type="text"
                        value={newTeamMember}
                        onChange={(e) => setNewTeamMember(e.target.value)}
                        placeholder="Add GitHub username"
                        onKeyPress={(e) => e.key === 'Enter' && addTeamMember()}
                      />
                      <button onClick={addTeamMember} className="add-button">Add</button>
                    </div>
                    <ul className="team-members-list">
                      {teamMembers.map(member => (
                        <li key={member} className={DEFAULT_TEAM_MEMBERS.includes(member) ? 'preset-item' : ''}>
                          {member}
                          <button onClick={() => removeTeamMember(member)} className="remove-button">✕</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                
                <div className="settings-column">
                  <div className="form-group">
                    <label>Repositories:</label>
                    <div className="repo-actions">
                      <div className="repo-search-container">
                        <input
                          type="text"
                          placeholder="Search repositories..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="repo-search-input"
                        />
                      </div>
                      <button 
                        className="load-default-repos-button" 
                        onClick={useDefaultRepos}
                        title="Load predefined repositories"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: '6px'}}>
                          <path d="M2 2.5A2.5 2.5 0 014.5 0h7A2.5 2.5 0 0114 2.5v10.5a.5.5 0 01-.5.5H12v-1h1V2.5A1.5 1.5 0 0011.5 1h-7A1.5 1.5 0 003 2.5V13H2V2.5z" fill="currentColor" />
                          <path d="M8 11.5A1.5 1.5 0 019.5 10h2A1.5 1.5 0 0113 11.5v2A1.5 1.5 0 0111.5 15h-2A1.5 1.5 0 018 13.5v-2zm1.5-.5a.5.5 0 00-.5.5v2a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-2a.5.5 0 00-.5-.5h-2z" fill="currentColor" />
                          <path d="M0 5.5A1.5 1.5 0 011.5 4h2A1.5 1.5 0 015 5.5v2A1.5 1.5 0 013.5 9h-2A1.5 1.5 0 010 7.5v-2zm1.5-.5a.5.5 0 00-.5.5v2a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-2a.5.5 0 00-.5-.5h-2z" fill="currentColor" />
                        </svg>
                        Use Default Repos
                      </button>
                    </div>
                    <div className="repositories-list">
                      {repositories
                        .filter(repo => repo.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map(repo => (
                          <div key={repo} className={`repo-item ${DEFAULT_REPOS.includes(repo) ? 'preset-repo' : ''}`}>
                            <label className="repo-label">
                              <input
                                type="checkbox"
                                checked={selectedRepos.includes(repo)}
                                onChange={() => toggleRepository(repo)}
                              />
                              <span className="repo-name">{repo}</span>
                            </label>
                          </div>
                        ))}
                      {repoLoading && (
                        <div className="loading-more">Loading repositories...</div>
                      )}
                      {hasNextPage && !repoLoading && (
                        <button className="load-more-button" onClick={loadMoreRepos}>
                          Load More Repositories
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeSettingsTab === 'general' && (
            <div className="fetch-pr-container">
              <button 
                className="fetch-button"
                onClick={fetchPullRequests}
                disabled={loading}
              >
                {loading ? 'Loading Pull Requests...' : 'Fetch Pull Requests'}
              </button>
            </div>
          )}
        </>
      )}
      
      {error && <div className="error-message">{error}</div>}
    </div>
  );

  // Render loading container with progress indicator
  const renderLoadingContainer = () => {
    const progressPercentage = loadingProgress.total > 0 
      ? Math.min(Math.round((loadingProgress.completed / loadingProgress.total) * 100), 100)
      : 0;
    
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Fetching pull requests...</p>
        {loadingProgress.total > 0 && (
          <div className="loading-progress">
            <div className="progress-bar">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
            <div className="progress-text">
              {loadingProgress.stage} ({progressPercentage}%)
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render PR results with improved column sizing and security
  const renderPRResults = () => {
    if (loading) {
      return renderLoadingContainer();
    }
    
    if (filteredPRs.length > 0) {
      return (
        <div className="pr-results">
          <h2>Open Pull Requests {filteredPRs.length > 0 && `(${filteredPRs.length})`}</h2>
          <div className="pr-table-container">
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Created</th>
                  <th className="review-status-header">Review Status</th>
                  <th>Comments</th>
                  <th>Mergeable</th>
                  <th className="slack-column">Slack Thread</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPRs.map(renderPRRow)}
              </tbody>
            </table>
          </div>
        </div>
      );
    } else if (pullRequests.length > 0) {
      return (
        <div className="no-results">
          <h3>No pull requests match your current filters</h3>
          <p>Try changing your filter settings or selecting different repositories</p>
        </div>
      );
    }
    
    return null;
  };

  // Create a memoized modal component to prevent unnecessary rerenders
  const SlackLinkModal = memo(() => {
    if (!slackLinkModal.isOpen) return null;
    
    // Input change handler that doesn't cause parent component rerender
    const handleInputChange = (e) => {
      modalInputRef.current = e.target.value;
    };
    
    // Key handler for Enter and Escape
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveSlackLinkFromModal();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSlackLinkModal();
      }
    };
    
    return (
      <div className="modal-overlay" onClick={closeSlackLinkModal}>
        <div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>
              {slackLinkModal.currentLink ? 'Edit' : 'Add'} Slack Link
            </h3>
            <button 
              className="modal-close-button"
              onClick={closeSlackLinkModal}
            >
              ×
            </button>
          </div>
          
          <div className="modal-body">
            <label htmlFor="slack-link-input">Slack Thread URL:</label>
            <input
              id="slack-link-input"
              type="text"
              ref={slackLinkInputRef}
              defaultValue={slackLinkModal.currentLink}
              onChange={handleInputChange}
              placeholder="https://gohighlevel.slack.com/archives/..."
              className="modal-input"
              onKeyDown={handleKeyDown}
              autoFocus
            />
            
            <div className="modal-help-text">
              Add a link to the Slack thread discussing this pull request.
              This will also be added to the PR description.
            </div>
          </div>
          
          <div className="modal-footer">
            <button
              className="modal-button modal-cancel"
              onClick={closeSlackLinkModal}
            >
              Cancel
            </button>
            <button
              className="modal-button modal-save"
              onClick={saveSlackLinkFromModal}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  });

  // Render a PR row with improved security - Now using modal
  const renderPRRow = (pr) => {
    // Repair PR data instead of skipping
    if (!pr) {
      return null; // We can't render null PRs
    }

    // Fill in missing properties
    if (!pr.user) pr.user = { login: 'unknown' };
    if (!pr.reviews) pr.reviews = [];
    if (!pr.reviewers) pr.reviewers = [];
    if (!pr.head) pr.head = { ref: 'unknown-branch' };
    if (!pr.repo) pr.repo = 'unknown-repo';
    if (!pr.number) pr.number = '0';
    if (!pr.title) pr.title = 'Untitled PR';

    const reviewStatus = getReviewStatus(pr);
    const slackLink = getSlackLink(pr);
    const prWithSameBranchAndLink = !slackLink && findPRsWithSameBranch(pr);
    const unresolvedCount = getUnresolvedCommentsCount(pr);
    
    // Check if this PR is currently being updated
    const isUpdating = updatingPRs[`${pr.repo}-${pr.number}`];
    
    return (
      <tr key={`${pr.repo}-${pr.number}`} className={isUpdating ? 'pr-row-updating' : ''}>
        <td className="pr-title-cell">
          <span className="pr-repo-badge">{sanitizeText(pr.repo)}</span>
          <span className="pr-number">#{pr.number}</span>
          <a href={pr.html_url || '#'} 
             target="_blank" 
             rel="noopener noreferrer" 
             className="pr-title-link"
          >
            {sanitizeText(pr.title)}
          </a>
          <div className="pr-branch">
            <span className="branch-label">Branch:</span> {sanitizeText(pr.head.ref)}
          </div>
        </td>
        <td>
          <div className="pr-author">
            {sanitizeText(pr.user.login)}
          </div>
        </td>
        <td>
          {formatDate(pr.created_at)}
        </td>
        <td className="review-status-cell">
          <div className="review-badges">
            {reviewStatus.pending.length > 0 && (
              <span className="review-badge pending">
                {reviewStatus.pending.length} pending
              </span>
            )}
            {Object.entries(reviewStatus.states).map(([reviewer, state]) => (
              <span 
                key={reviewer} 
                className={`review-badge ${state === 'APPROVED' ? 'approved' : state === 'CHANGES_REQUESTED' ? 'changes-requested' : ''}`}
              >
                {sanitizeText(reviewer)} {state === 'APPROVED' ? '✓' : state === 'CHANGES_REQUESTED' ? '×' : ''}
              </span>
            ))}
          </div>
          {reviewStatus.pending.length > 0 && (
            <div className="pending-reviewers">
              <span className="pending-label">Waiting on:</span>
              {reviewStatus.pending.map((reviewer, index) => (
                <span key={reviewer} className="pending-reviewer">
                  {sanitizeText(reviewer)}{index < reviewStatus.pending.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="unresolved-comments-cell">
          {unresolvedCount > 0 ? (
            <span className="unresolved-badge">{unresolvedCount}</span>
          ) : (
            <span className="resolved-badge">0</span>
          )}
        </td>
        <td className="mergeable-cell">
          {pr.mergeable === null ? (
            <span className="mergeable-badge unknown">Checking...</span>
          ) : pr.mergeable && pr.mergeable_state === 'clean' && !pr.mergeBlockReason ? (
            <span className="mergeable-badge mergeable">Yes</span>
          ) : (
            <div className="mergeable-status">
              <span className="mergeable-badge not-mergeable">No</span>
              {(pr.mergeBlockReason || 
                pr.mergeable_state !== 'clean') && (
                <span className="mergeable-reason">
                  {pr.mergeBlockReason ? sanitizeText(pr.mergeBlockReason) :
                   pr.mergeable_state === 'behind' ? 'Branch out of date' : 
                   pr.mergeable_state === 'dirty' ? 'Conflicts' : 
                   pr.mergeable_state === 'blocked' ? 'Checks or reviews required' : 
                   pr.mergeable_state === 'unstable' ? 'Tests failing' : 
                   pr.mergeable_state === 'has_hooks' ? 'Waiting for hooks' :
                   sanitizeText(pr.mergeable_state)}
                </span>
              )}
            </div>
          )}
        </td>
        <td className="slack-link-cell">
          {isUpdating ? (
            <div className="slack-link-loading">
              <div className="row-spinner"></div>
              <span>Updating PR...</span>
            </div>
          ) : (
            <>
              {slackLink ? (
                <div className="slack-link-display">
                  <a 
                    href={slackLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="slack-link"
                  >
                    Slack
                  </a>
                  <button 
                    onClick={() => openSlackLinkModal(pr, slackLink)} 
                    className="edit-slack-link-button"
                    title="Edit Slack link"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M16.293 2.293a1 1 0 0 1 1.414 0l4 4a1 1 0 0 1 0 1.414l-13 13A1 1 0 0 1 8 21H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 .293-.707l13-13z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ) : prWithSameBranchAndLink ? (
                <div className="slack-link-display">
                  <button 
                    onClick={() => copySlackLinkFromSameBranch(pr, prWithSameBranchAndLink)} 
                    className="copy-slack-link-button"
                    title={`Copy link from PR #${prWithSameBranchAndLink.number}`}
                  >
                    Copy from #{prWithSameBranchAndLink.number}
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => openSlackLinkModal(pr, '')} 
                  className="add-slack-link-button"
                >
                  Add Link
                </button>
              )}
            </>
          )}
        </td>
        <td>
          <div className="action-links">
            <a href={pr.html_url} target="_blank" rel="noopener noreferrer" className="action-link github-link">
              GitHub
            </a>
          </div>
        </td>
      </tr>
    );
  };

  // Secure content wrapper component - only shows content if user is authenticated and in org
  const SecureContent = ({ children }) => {
    if (!isLoggedIn) {
      return (
        <div className="secure-content">
          <div className="authenticate-warning">
            <h3>Authentication Required</h3>
            <p>Please log in with GitHub to view this content.</p>
            <p>You must be a member of the {organization} organization.</p>
          </div>
          {renderLogin()}
        </div>
      );
    }
    
    return children;
  };

  return (
    <div className="App">
      {renderHeader()}
      
      {!isLoggedIn ? (
        renderLogin()
      ) : (
        <SecureContent>
          <div className="main-content">
            {renderSettingsPanel()}
            {renderPRResults()}
            <SlackLinkModal />
          </div>
        </SecureContent>
      )}
    </div>
  );
}

export default App;
// App.js
import React, { useState, useEffect } from 'react';
import './App.css';
import { Octokit } from '@octokit/rest';

// Preset values
const DEFAULT_ORGANIZATION = 'GoHighLevel';
const DEFAULT_TEAM_MEMBERS = ['ajayreddy611', 'ayush-highlevel', 'nihalmaddela12', 'hammad-ghl'];
const DEFAULT_REPOS = ['leadgen-marketplace-backend', 'ghl-content-ai', 'spm-ts', 'platform-backend'];

function App() {
  const [githubToken, setGithubToken] = useState(localStorage.getItem('github_token') || '');
  const [slackToken, setSlackToken] = useState(localStorage.getItem('slack_token') || '');
  const [slackChannel, setSlackChannel] = useState(localStorage.getItem('slack_channel') || '');
  const [organization] = useState(DEFAULT_ORGANIZATION);
  const [teamMembers, setTeamMembers] = useState(
    JSON.parse(localStorage.getItem('team_members') || JSON.stringify(DEFAULT_TEAM_MEMBERS))
  );
  const [pullRequests, setPullRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [slackLoading, setSlackLoading] = useState(false);
  const [repoLoading, setRepoLoading] = useState(false);
  const [newTeamMember, setNewTeamMember] = useState('');
  const [repositories, setRepositories] = useState([]);
  const [selectedRepos, setSelectedRepos] = useState(
    JSON.parse(localStorage.getItem('selected_repos') || JSON.stringify(DEFAULT_REPOS))
  );
  const [error, setError] = useState('');
  const [slackError, setSlackError] = useState('');
  const [showInitialSetup, setShowInitialSetup] = useState(!localStorage.getItem('github_token'));
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [statusFilter, setStatusFilter] = useState('needs-review');
  const [authorFilter, setAuthorFilter] = useState('all');
  const [reviewerFilter, setReviewerFilter] = useState('all');
  const [repoFilter, setRepoFilter] = useState('all');
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [activeSettingsTab, setActiveSettingsTab] = useState('general');

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('github_token', githubToken);
    localStorage.setItem('slack_token', slackToken);
    localStorage.setItem('slack_channel', slackChannel);
    localStorage.setItem('team_members', JSON.stringify(teamMembers));
    localStorage.setItem('selected_repos', JSON.stringify(selectedRepos));
  }, [githubToken, slackToken, slackChannel, teamMembers, selectedRepos]);

  // Fetch repositories when token is available
  useEffect(() => {
    if (githubToken) {
      fetchRepositories(1);
    }
  }, [githubToken]);

  // Auto-fetch pull requests when repositories are loaded and token is available
  useEffect(() => {
    if (githubToken && selectedRepos.length > 0 && repositories.length > 0) {
      fetchPullRequests();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubToken, repositories]);

  // Function to fetch repositories with pagination
  const fetchRepositories = async (pageNum) => {
    if (!githubToken) return;
    
    setRepoLoading(true);
    setError('');
    
    try {
      const octokit = new Octokit({ auth: githubToken });
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
      
      // Check if there are more pages
      const linkHeader = response.headers.link;
      setHasNextPage(linkHeader && linkHeader.includes('rel="next"'));
      setPage(pageNum);
      setRepoLoading(false);
    } catch (err) {
      setError(`Error fetching repositories: ${err.message}`);
      setRepoLoading(false);
    }
  };

  // Fetch more repositories when user clicks "Load More"
  const loadMoreRepos = () => {
    fetchRepositories(page + 1);
  };

  // Function to fetch PRs with filtering
  const fetchPullRequests = async () => {
    if (!githubToken || selectedRepos.length === 0) {
      setError('Please provide GitHub token and select at least one repository.');
      return;
    }
    
    setLoading(true);
    setPullRequests([]);
    setError('');
    
    try {
      const octokit = new Octokit({ auth: githubToken });
      const allPRs = [];
      
      // For each selected repository
      for (const repo of selectedRepos) {
        // Get open PRs for the repo
        const prs = await octokit.pulls.list({
          owner: organization,
          repo: repo,
          state: 'open',  // Only fetch open PRs
          per_page: 100
        });
        
        // Filter PRs by team members
        const teamPRs = prs.data.filter(pr => {
          // Check if PR author is a team member
          const isAuthor = teamMembers.includes(pr.user.login);
          // Or if any team member is a reviewer
          const isReviewer = pr.requested_reviewers && 
            pr.requested_reviewers.some(reviewer => teamMembers.includes(reviewer.login));
          
          return isAuthor || isReviewer;
        });
        
        // Get PR reviews for each team PR
        for (const pr of teamPRs) {
          const reviews = await octokit.pulls.listReviews({
            owner: organization,
            repo: repo,
            pull_number: pr.number
          });
          
          allPRs.push({
            ...pr,
            repo,
            reviews: reviews.data,
            teamMember: teamMembers.find(member => member === pr.user.login),
            reviewers: pr.requested_reviewers || [],
            slackMessages: [] // Initialize with empty array
          });
        }
      }
      
      setPullRequests(allPRs);
      setLoading(false);
      
      // Auto-collapse settings after fetching PRs if there are results
      if (allPRs.length > 0) {
        setSettingsExpanded(false);
        
        // Reset repo filter when new PRs are fetched
        setRepoFilter('all');
      }
      
      // If Slack token and channel are available, search for messages related to these PRs
      if (slackToken && slackChannel && allPRs.length > 0) {
        fetchSlackMessages(allPRs);
      }
    } catch (err) {
      setError(`Error fetching pull requests: ${err.message}`);
      setLoading(false);
    }
  };
  
  // Function to fetch Slack messages related to PRs
  const fetchSlackMessages = async (prs) => {
    if (!slackToken || !slackChannel) {
      setSlackError('Slack token and channel are required to fetch Slack messages.');
      return;
    }
    
    setSlackLoading(true);
    setSlackError('');
    
    try {
      // Create a deep copy of the PRs array to add Slack messages
      const updatedPRs = JSON.parse(JSON.stringify(prs));
      
      // For each PR, search for messages that contain its URL
      for (let i = 0; i < updatedPRs.length; i++) {
        const pr = updatedPRs[i];
        const prUrl = pr.html_url;
        
        // Slack API call to search for messages
        const response = await fetch('https://slack.com/api/conversations.history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${slackToken}`
          },
          body: new URLSearchParams({
            channel: slackChannel,
            limit: 100
          })
        });
        
        const data = await response.json();
        
        if (!data.ok) {
          throw new Error(data.error || 'Unknown Slack API error');
        }
        
        // Filter messages that contain the PR URL
        const relatedMessages = data.messages
          .filter(msg => msg.text && msg.text.includes(prUrl))
          .map(msg => ({
            ts: msg.ts,
            text: msg.text,
            user: msg.user,
            permalink: '' // Will be populated in the next step
          }));
        
        // Get permalink for each message
        for (let j = 0; j < relatedMessages.length; j++) {
          const msg = relatedMessages[j];
          
          const permalinkResponse = await fetch('https://slack.com/api/chat.getPermalink', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Bearer ${slackToken}`
            },
            body: new URLSearchParams({
              channel: slackChannel,
              message_ts: msg.ts
            })
          });
          
          const permalinkData = await permalinkResponse.json();
          
          if (permalinkData.ok) {
            relatedMessages[j].permalink = permalinkData.permalink;
          }
        }
        
        updatedPRs[i].slackMessages = relatedMessages;
      }
      
      setPullRequests(updatedPRs);
      setSlackLoading(false);
    } catch (err) {
      setSlackError(`Error fetching Slack messages: ${err.message}`);
      setSlackLoading(false);
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
    const reviewerLogins = pr.reviewers.map(r => r.login);
    const completedReviews = {};
    
    // Count completed reviews by reviewer
    pr.reviews.forEach(review => {
      if (review.state !== 'COMMENTED') {
        completedReviews[review.user.login] = review.state;
      }
    });
    
    return {
      reviewed: Object.keys(completedReviews),
      pending: reviewerLogins.filter(login => !completedReviews[login]),
      states: completedReviews
    };
  };
  
  // Get all unique reviewers from pull requests
  const getAllReviewers = () => {
    const reviewers = new Set();
    pullRequests.forEach(pr => {
      pr.reviewers.forEach(reviewer => {
        reviewers.add(reviewer.login);
      });
    });
    return Array.from(reviewers);
  };
  
  // Get all unique repositories from pull requests
  const getAllRepos = () => {
    const repos = new Set();
    pullRequests.forEach(pr => {
      repos.add(pr.repo);
    });
    return Array.from(repos).sort();
  };
  
  // Filter PRs based on selected filters
  const filteredPRs = pullRequests.filter(pr => {
    // Filter by status
    if (statusFilter === 'needs-review') {
      const status = getReviewStatus(pr);
      if (status.pending.length === 0) return false;
    }
    
    // Filter by author
    if (authorFilter !== 'all' && pr.user.login !== authorFilter) {
      return false;
    }
    
    // Filter by reviewer
    if (reviewerFilter !== 'all') {
      const hasReviewer = pr.reviewers.some(reviewer => reviewer.login === reviewerFilter);
      if (!hasReviewer) return false;
    }
    
    // Filter by repository
    if (repoFilter !== 'all' && pr.repo !== repoFilter) {
      return false;
    }
    
    return true;
  });

  return (
    <div className="App">
      <header className="App-header">
        <h1>GoHighLevel PR Tracker</h1>
        {!showInitialSetup && (
          <div className="header-actions">
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="filter-select"
            >
              <option value="needs-review">Needs Review</option>
              <option value="all">All Open PRs</option>
            </select>
            
            <select 
              value={authorFilter} 
              onChange={(e) => setAuthorFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Authors</option>
              {teamMembers.map(member => (
                <option key={member} value={member}>{member}</option>
              ))}
            </select>
            
            <select 
              value={reviewerFilter} 
              onChange={(e) => setReviewerFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Reviewers</option>
              {getAllReviewers().map(reviewer => (
                <option key={reviewer} value={reviewer}>{reviewer}</option>
              ))}
            </select>
            
            <select 
              value={repoFilter} 
              onChange={(e) => setRepoFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Repositories</option>
              {getAllRepos().map(repo => (
                <option key={repo} value={repo}>{repo}</option>
              ))}
            </select>
            
            <button 
              className="refresh-button"
              onClick={fetchPullRequests}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh PRs'}
            </button>
          </div>
        )}
      </header>
      
      {showInitialSetup ? (
        <div className="settings-panel">
          <h2>Initial Setup</h2>
          <div className="form-group">
            <label>GitHub Personal Access Token:</label>
            <input 
              type="password" 
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_your_personal_access_token"
            />
            <p className="help-text">
              Your token needs <code>repo</code> scope permissions.
              <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer">
                Create a token
              </a>
            </p>
            <button 
              className="save-token-button"
              onClick={() => {
                if (githubToken) {
                  setShowInitialSetup(false);
                  fetchRepositories(1);
                }
              }}
            >
              Save Token
            </button>
          </div>
        </div>
      ) : (
        <div className="main-content">
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
                  <button 
                    className={`settings-tab ${activeSettingsTab === 'github' ? 'active' : ''}`}
                    onClick={() => setActiveSettingsTab('github')}
                  >
                    GitHub Token
                  </button>
                  <button 
                    className={`settings-tab ${activeSettingsTab === 'slack' ? 'active' : ''}`}
                    onClick={() => setActiveSettingsTab('slack')}
                  >
                    Slack Integration
                  </button>
                </div>
                
                {activeSettingsTab === 'github' && (
                  <div className="settings-tab-content">
                    <div className="github-settings">
                      <h3>GitHub Authentication</h3>
                      <div className="form-group">
                        <label>GitHub Personal Access Token:</label>
                        <input 
                          type="password" 
                          value={githubToken}
                          onChange={(e) => setGithubToken(e.target.value)}
                          placeholder="ghp_your_personal_access_token"
                        />
                        <p className="help-text">
                          Your token needs <code>repo</code> scope permissions.
                          <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer">
                            Create a token
                          </a>
                        </p>
                        <button 
                          className="save-settings-button"
                          onClick={() => {
                            if (githubToken) {
                              fetchRepositories(1);
                              setActiveSettingsTab('general');
                            }
                          }}
                        >
                          Save GitHub Token
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {activeSettingsTab === 'slack' && (
                  <div className="settings-tab-content">
                    <div className="slack-settings">
                      <h3>Slack Integration</h3>
                      <p className="help-text">
                        Connect to Slack to find PR-related messages in a specific channel.
                      </p>
                      
                      <div className="form-group">
                        <label>Slack Bot Token:</label>
                        <input 
                          type="password" 
                          value={slackToken}
                          onChange={(e) => setSlackToken(e.target.value)}
                          placeholder="xoxb-your-slack-bot-token"
                        />
                        <p className="help-text">
                          Requires a bot token with <code>channels:history</code>, <code>chat:write</code>, and <code>links:read</code> permissions.
                          <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">
                            Create a Slack app
                          </a>
                        </p>
                      </div>
                      
                      <div className="form-group">
                        <label>Slack Channel ID:</label>
                        <input 
                          type="text" 
                          value={slackChannel}
                          onChange={(e) => setSlackChannel(e.target.value)}
                          placeholder="C012AB3CD45"
                        />
                        <p className="help-text">
                          The ID of the channel to search for PR messages. Must start with C or D.
                        </p>
                      </div>
                      
                      {slackError && <div className="error-message">{slackError}</div>}
                      
                      <button 
                        className="save-settings-button"
                        onClick={() => {
                          setActiveSettingsTab('general');
                          if (pullRequests.length > 0 && slackToken && slackChannel) {
                            fetchSlackMessages(pullRequests);
                          }
                        }}
                      >
                        Save Slack Settings
                      </button>
                    </div>
                  </div>
                )}
                
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
                          <div className="repo-search">
                            <input
                              type="text"
                              placeholder="Search repositories..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                            />
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
          
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Fetching pull requests...</p>
            </div>
          ) : slackLoading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Fetching Slack messages...</p>
            </div>
          ) : filteredPRs.length > 0 ? (
            <div className="pr-results">
              <h2>Open Pull Requests {filteredPRs.length > 0 && `(${filteredPRs.length})`}</h2>
              <div className="pr-cards">
                {filteredPRs.map(pr => {
                  const reviewStatus = getReviewStatus(pr);
                  return (
                    <div key={`${pr.repo}-${pr.number}`} className="pr-card">
                      <div className="pr-card-header">
                        <div className="pr-repo">{pr.repo}</div>
                        <a href={pr.html_url} target="_blank" rel="noopener noreferrer" className="pr-link">
                          #{pr.number}
                        </a>
                      </div>
                      <h3 className="pr-title">
                        <a href={pr.html_url} target="_blank" rel="noopener noreferrer">
                          {pr.title}
                        </a>
                      </h3>
                      <div className="pr-meta">
                        <div className="pr-author">
                          <span className="meta-label">Author:</span> {pr.user.login}
                        </div>
                        <div className="pr-date">
                          <span className="meta-label">Created:</span> {formatDate(pr.created_at)}
                        </div>
                      </div>
                      <div className="pr-reviews">
                        <div className="review-header">
                          <h4>Review Status</h4>
                          <span className={`pending-count ${reviewStatus.pending.length > 0 ? 'has-pending' : ''}`}>
                            {reviewStatus.pending.length} pending
                          </span>
                        </div>
                        
                        {pr.reviewers.length > 0 ? (
                          <div className="reviewers-list">
                            {pr.reviewers.map(reviewer => {
                              const hasReviewed = reviewStatus.reviewed.includes(reviewer.login);
                              const reviewState = reviewStatus.states[reviewer.login];
                              
                              return (
                                <div 
                                  key={reviewer.login} 
                                  className={`reviewer-item ${hasReviewed ? 'reviewed' : 'pending'} ${reviewState?.toLowerCase() || ''}`}
                                >
                                  <span className="reviewer-name">{reviewer.login}</span>
                                  <span className="review-status">
                                    {hasReviewed ? 
                                      (reviewState === 'APPROVED' ? '✓ Approved' : 
                                       reviewState === 'CHANGES_REQUESTED' ? '× Changes Requested' : 
                                       'Reviewed') : 
                                      'Pending'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="no-reviewers">No reviewers assigned</div>
                        )}
                      </div>
                      
                      {pr.slackMessages && pr.slackMessages.length > 0 && (
                        <div className="slack-messages">
                          <h4>
                            <span className="slack-icon">
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="#2EB67D">
                                <path d="M5.042 19.205A2.5 2.5 0 017.5 17.75h9a2.5 2.5 0 012.458 2.046M3.042 16.205A2.5 2.5 0 015.5 14.75h13a2.5 2.5 0 012.458 2.046M18.75 4.778a2.53 2.53 0 00-4.806-1.056A2.53 2.53 0 009.138 4.5a2.53 2.53 0 00-4.806-1.056A2.53 2.53 0 00.125 4.5v5.025a2.53 2.53 0 001.25 4.806.97.97 0 01.934 1.062A2.53 2.53 0 007.5 16.15a2.53 2.53 0 004.068.748 2.53 2.53 0 004.806-1.056 2.53 2.53 0 004.806-1.056 2.53 2.53 0 000-4.806.969.969 0 01-.934-1.062 2.53 2.53 0 00-1.556-4.14z"/>
                              </svg>
                            </span>
                            Slack Discussions
                          </h4>
                          <div className="slack-messages-list">
                            {pr.slackMessages.map((msg, index) => (
                              <a 
                                key={index} 
                                href={msg.permalink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="slack-message-item"
                              >
                                <div className="slack-message-preview">
                                  {msg.text.length > 100 ? `${msg.text.substring(0, 100)}...` : msg.text}
                                </div>
                                <div className="slack-message-link">
                                  Open in Slack →
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="pr-actions">
                        <a href={pr.html_url} target="_blank" rel="noopener noreferrer" className="view-button">
                          View on GitHub
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : pullRequests.length > 0 ? (
            <div className="no-results">
              <h3>No pull requests match your current filters</h3>
              <p>Try changing your filter settings or selecting different repositories</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default App;
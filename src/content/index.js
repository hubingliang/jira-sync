const axios = require('axios')
require('babel-polyfill')
const jiraSync = async projectKey => {
  const initProjectData = async projectKey => {
    const getTransitionsData = async projectId => {
      const initMatrix = (allPaths, allStatus) => {
        const matrix = []
        const floyd = matrix => {
          var n = matrix && matrix.length
          var m = n && matrix[0].length
          if (m && n && m === n) {
            for (var k = 0; k < n; k++) {
              for (var i = 0; i < n; i++) {
                for (var j = 0; j < n; j++) {
                  if (matrix[i][k].length + matrix[k][j].length < matrix[i][j].length) {
                    matrix[i][j].length = matrix[i][k].length + matrix[k][j].length
                    matrix[i][j].from = matrix[i][k].from.length > 0 ? [...matrix[i][k].from] : []
                    matrix[i][j].from.push(k)
                  }
                }
              }
            }
          }
          return matrix
        }
        allStatus.map(status => {
          const row = []
          allStatus.map(() => {
            row.push({
              length: Infinity,
              from: [],
            })
          })
          const index = allStatus.findIndex(_ => {
            return +_ === +status
          })
          row[index].length = 0
          allPaths.map(path => {
            if (path.fromStatusId === status) {
              const index = allStatus.findIndex(_ => {
                return +_ === +path.toStatusId
              })
              row[index].length = 1
            }
          })
          matrix.push(row)
        })
        return floyd(matrix)
      }
      const initStatus = allPaths => {
        const allStatus = []
        allPaths.map(_ => {
          if (_.fromStatusId && _.toStatusId) {
            allStatus.push(_.fromStatusId)
            allStatus.push(_.toStatusId)
          }
        })
        return [...new Set(allStatus)]
      }
      try {
        const response = await axios.get(
          `/rest/greenhopper/1.0/xboard/work/transitions.json?projectId=${projectId}&_=${new Date().getTime()}`,
        )
        const projectData = {}
        const allStatus = {}
        const allMatrix = {}
        projectData['transitionsData'] = response.data
        for (let [k, v] of Object.entries(projectData['transitionsData'].workflowToTransitions)) {
          allStatus[k] = initStatus(v)
          allMatrix[k] = initMatrix(v, allStatus[k])
        }
        projectData['allStatus'] = allStatus
        projectData['allMatrix'] = allMatrix
        projectData['projectId'] = projectId
        return projectData
      } finally {
      }
    }
    try {
      const response = await axios.get(
        `/rest/api/2/project/${projectKey}?_=${new Date().getTime()}`,
      )
      const projectData = await getTransitionsData(response.data.id)
      return projectData
    } finally {
    }
  }
  const getIssueData = async () => {
    try {
      const response = await axios.get(
        `/rest/greenhopper/1.0/xboard/work/allData.json?rapidViewId=${window.localStorage.getItem(
          'gh.latestRapidViewId',
        )}&selectedProjectKey=${projectKey}&_=${new Date().getTime()}`,
      )
      const issueData = {}
      issueData['allIssues'] = response.data.issuesData.issues
      const parents = []
      response.data.swimlanesData.parentSwimlanesData.parentIssueIds.map(parentIssueId => {
        issueData['allIssues'].map(issue => {
          if (issue.id === parentIssueId) {
            parents.push(issue)
          }
        })
      })
      issueData['allParents'] = parents
      return issueData
    } finally {
    }
  }
  const syncStatus = async parent => {
    const getFromAndTo = parent => {
      let subStatusList = []
      allIssues.map(_ => {
        if (parent && _.parentId === parent.id) {
          subStatusList.push(_.status.id)
        }
      })
      if (subStatusList.length !== 0) {
        if ([...new Set(subStatusList)].length === 1) {
          if (parent.status.id === subStatusList[0]) {
            console.log(parent.key, '状态一致，无需同步')
            return { from: null, to: null, typeId: null }
          } else {
            return { from: parent.status.id, to: subStatusList[0], typeId: parent.typeId }
          }
        } else {
          console.log(parent.key, '子任务状态不统一，不同步')
          return { from: null, to: null, typeId: null }
        }
      } else {
        console.log(parent.key, '无子任务，无需同步')
        return { from: null, to: null, typeId: null }
      }
    }
    const getApiList = (from, to, typeId) => {
      if (!from) {
        return []
      }
      const status = allStatus[transitionsData.projectAndIssueTypeToWorkflow[projectId][typeId]]
      let fromIndex = status.findIndex(_ => {
        return +_ === +from
      })
      let toIndex = status.findIndex(_ => {
        return +_ === +to
      })
      let allPaths =
        transitionsData.workflowToTransitions[
          transitionsData.projectAndIssueTypeToWorkflow[projectId][typeId]
        ]
      let apiList = []
      let matrix = allMatrix[transitionsData.projectAndIssueTypeToWorkflow[projectId][typeId]]
      if (matrix[fromIndex][toIndex].from.length === 0) {
        allPaths.map(_ => {
          if (+from === _.fromStatusId && +to === _.toStatusId) {
            apiList.push(_.transitionId)
          }
        })
        return apiList
      } else {
        const passStatusCodes = matrix[fromIndex][toIndex].from.map(_ => {
          return +status[_]
        })
        const statusPath = [from, ...passStatusCodes, to]
        for (let i = 0; i < statusPath.length - 1; i++) {
          allPaths.map(_ => {
            if (+statusPath[i] === _.fromStatusId && +statusPath[i + 1] === _.toStatusId) {
              apiList.push(_.transitionId)
            }
          })
        }
        return apiList
      }
    }
    const changeParentStatus = async actionId => {
      try {
        const token = document.cookie.replace(
          /(?:(?:^|.*;\s*)atlassian.xsrf.token\s*\=\s*([^;]*).*$)|^.*$/,
          '$1',
        )
        await axios.get(
          `/secure/WorkflowUIDispatcher.jspa?id=${
            parent.id
          }&action=${actionId}&atl_token=${token}&decorator=dialog&inline=true&_=${new Date().getTime()}`,
        )
      } catch (error) {}
    }
    const { from, to, typeId } = getFromAndTo(parent)
    const apiList = getApiList(from, to, typeId)
    for (let api of apiList) {
      await changeParentStatus(api)
    }
  }
  const { transitionsData, allMatrix, allStatus, projectId } = await initProjectData(projectKey)
  const { allIssues, allParents } = await getIssueData()

  await Promise.all(
    allParents.map(parent => {
      return syncStatus(parent)
    }),
  )
  location.reload()
}
if (window.location.href.includes('jira')) {
  window.addEventListener(
    'message',
    function(event) {
      console.log('Project key', event.data)
      jiraSync(event.data)
    },
    false,
  )
}

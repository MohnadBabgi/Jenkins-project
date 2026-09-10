pipeline {
    agent any

    environment {
        IMAGE_NAME = 'muhnnad/devops-status-app'
        IMAGE_TAG = "${env.BUILD_NUMBER}"
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-credentials')
        KUBECONFIG = '/var/lib/jenkins/.kube/config'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                dir('app') {
                    script {
                        env.APP_VERSION = sh(
                            script: "grep -m1 '\"version\"' package.json | sed -E 's/.*\"version\": *\"([^\"]+)\".*/\\1/'",
                            returnStdout: true
                        ).trim()
                    }
                    sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} ."
                }
            }
        }

        stage('Push') {
            steps {
                sh "echo \"${DOCKERHUB_CREDENTIALS_PSW}\" | docker login -u \"${DOCKERHUB_CREDENTIALS_USR}\" --password-stdin"
                sh "docker push ${IMAGE_NAME}:${IMAGE_TAG}"
            }
        }

        stage('Deploy') {
            steps {
                sh "kubectl set image deployment/devops-status-app devops-status-app=${IMAGE_NAME}:${IMAGE_TAG}"
                sh """kubectl set env deployment/devops-status-app \
                    GIT_COMMIT=${env.GIT_COMMIT.take(7)} \
                    BUILD_NUMBER=${env.BUILD_NUMBER} \
                    APP_VERSION=${env.APP_VERSION} \
                    REPO_URL='${env.GIT_URL}' \
                    BUILD_URL='${env.BUILD_URL}'"""
                sh "kubectl rollout status deployment/devops-status-app --timeout=90s"
            }
        }

        stage('Smoke test') {
            steps {
                sh "curl -sf http://localhost:30080/api/status"
            }
        }
    }

    post {
        always {
            sh 'docker logout || true'
        }
    }
}

const sinon = require('sinon')
const { expect } = require('chai')
const SandboxedModule = require('sandboxed-module')
const MockRequest = require('../helpers/MockRequest')
const MockResponse = require('../helpers/MockResponse')
const { ObjectId } = require('mongodb')
const Errors = require('../../../../app/src/Features/Errors/Errors')

const MODULE_PATH =
  '../../../../app/src/Features/Collaborators/CollaboratorsInviteController.js'

describe('CollaboratorsInviteController', function () {
  beforeEach(function () {
    this.projectId = 'project-id-123'
    this.token = 'some-opaque-token'
    this.targetEmail = 'user@example.com'
    this.privileges = 'readAndWrite'
    this.currentUser = {
      _id: 'current-user-id',
      email: 'current-user@example.com',
    }
    this.invite = {
      _id: ObjectId(),
      token: this.token,
      sendingUserId: this.currentUser._id,
      projectId: this.projectId,
      email: this.targetEmail,
      privileges: this.privileges,
      createdAt: new Date(),
    }

    this.SessionManager = {
      getSessionUser: sinon.stub().returns(this.currentUser),
    }

    this.AnalyticsManger = { recordEventForUser: sinon.stub() }

    this.rateLimiter = {
      consume: sinon.stub().resolves(),
    }
    this.RateLimiter = {
      RateLimiter: sinon.stub().returns(this.rateLimiter),
    }

    this.LimitationsManager = {
      promises: {
        allowedNumberOfCollaboratorsForUser: sinon.stub(),
        canAddXCollaborators: sinon.stub().resolves(true),
      },
    }

    this.UserGetter = {
      promises: {
        getUserByAnyEmail: sinon.stub(),
        getUser: sinon.stub(),
      },
    }

    this.ProjectGetter = {
      promises: {
        getProject: sinon.stub(),
      },
    }

    this.CollaboratorsGetter = {
      promises: {
        isUserInvitedMemberOfProject: sinon.stub(),
      },
    }

    this.CollaboratorsInviteHandler = {
      promises: {
        getAllInvites: sinon.stub(),
        inviteToProject: sinon.stub().resolves(this.invite),
        getInviteByToken: sinon.stub().resolves(this.invite),
        resendInvite: sinon.stub().resolves(this.invite),
        revokeInvite: sinon.stub().resolves(this.invite),
        acceptInvite: sinon.stub(),
      },
    }

    this.EditorRealTimeController = {
      emitToRoom: sinon.stub(),
    }

    this.settings = {}

    this.ProjectAuditLogHandler = {
      promises: {
        addEntry: sinon.stub().resolves(),
      },
      addEntryInBackground: sinon.stub(),
    }

    this.CollaboratorsInviteController = SandboxedModule.require(MODULE_PATH, {
      requires: {
        '../Project/ProjectGetter': this.ProjectGetter,
        '../Project/ProjectAuditLogHandler': this.ProjectAuditLogHandler,
        '../Subscription/LimitationsManager': this.LimitationsManager,
        '../User/UserGetter': this.UserGetter,
        './CollaboratorsGetter': this.CollaboratorsGetter,
        './CollaboratorsInviteHandler': this.CollaboratorsInviteHandler,
        '../Editor/EditorRealTimeController': this.EditorRealTimeController,
        '../Analytics/AnalyticsManager': this.AnalyticsManger,
        '../Authentication/SessionManager': this.SessionManager,
        '@overleaf/settings': this.settings,
        '../../infrastructure/RateLimiter': this.RateLimiter,
      },
    })

    this.res = new MockResponse()
    this.req = new MockRequest()
    this.next = sinon.stub()
  })

  describe('getAllInvites', function () {
    beforeEach(function () {
      this.fakeInvites = [
        { _id: ObjectId(), one: 1 },
        { _id: ObjectId(), two: 2 },
      ]
      this.req.params = { Project_id: this.projectId }
    })

    describe('when all goes well', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteHandler.promises.getAllInvites.resolves(
          this.fakeInvites
        )
        this.res.callback = () => done()
        this.CollaboratorsInviteController.getAllInvites(
          this.req,
          this.res,
          this.next
        )
      })

      it('should not produce an error', function () {
        this.next.callCount.should.equal(0)
      })

      it('should produce a list of invite objects', function () {
        this.res.json.callCount.should.equal(1)
        this.res.json
          .calledWith({ invites: this.fakeInvites })
          .should.equal(true)
      })

      it('should have called CollaboratorsInviteHandler.getAllInvites', function () {
        this.CollaboratorsInviteHandler.promises.getAllInvites.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteHandler.promises.getAllInvites
          .calledWith(this.projectId)
          .should.equal(true)
      })
    })

    describe('when CollaboratorsInviteHandler.getAllInvites produces an error', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteHandler.promises.getAllInvites.rejects(
          new Error('woops')
        )
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.getAllInvites(
          this.req,
          this.res,
          this.next
        )
      })

      it('should produce an error', function () {
        this.next.callCount.should.equal(1)
        this.next.firstCall.args[0].should.be.instanceof(Error)
      })
    })
  })

  describe('inviteToProject', function () {
    beforeEach(function () {
      this.req.params = { Project_id: this.projectId }
      this.req.body = {
        email: this.targetEmail,
        privileges: this.privileges,
      }
    })

    describe('when all goes well', function (done) {
      beforeEach(function (done) {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail =
          sinon.stub().resolves(true)
        this.CollaboratorsInviteController.promises._checkRateLimit = sinon
          .stub()
          .resolves(true)
        this.res.callback = () => done()
        this.CollaboratorsInviteController.inviteToProject(
          this.req,
          this.res,
          this.next
        )
      })

      it('should produce json response', function () {
        this.res.json.callCount.should.equal(1)
        expect(this.res.json.firstCall.args[0]).to.deep.equal({
          invite: this.invite,
        })
      })

      it('should have called canAddXCollaborators', function () {
        this.LimitationsManager.promises.canAddXCollaborators.callCount.should.equal(
          1
        )
        this.LimitationsManager.promises.canAddXCollaborators
          .calledWith(this.projectId)
          .should.equal(true)
      })

      it('should have called _checkShouldInviteEmail', function () {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail
          .calledWith(this.targetEmail)
          .should.equal(true)
      })

      it('should have called inviteToProject', function () {
        this.CollaboratorsInviteHandler.promises.inviteToProject.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteHandler.promises.inviteToProject
          .calledWith(
            this.projectId,
            this.currentUser,
            this.targetEmail,
            this.privileges
          )
          .should.equal(true)
      })

      it('should have called emitToRoom', function () {
        this.EditorRealTimeController.emitToRoom.callCount.should.equal(1)
        this.EditorRealTimeController.emitToRoom
          .calledWith(this.projectId, 'project:membership:changed')
          .should.equal(true)
      })

      it('adds a project audit log entry', function () {
        this.ProjectAuditLogHandler.addEntryInBackground.should.have.been.calledWith(
          this.projectId,
          'send-invite',
          this.currentUser._id,
          this.req.ip,
          {
            inviteId: this.invite._id,
            privileges: this.privileges,
          }
        )
      })
    })

    describe('when the user is not allowed to add more collaborators', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail =
          sinon.stub().resolves(true)
        this.CollaboratorsInviteController.promises._checkRateLimit = sinon
          .stub()
          .resolves(true)
        this.LimitationsManager.promises.canAddXCollaborators.resolves(false)
        this.res.callback = () => done()
        this.CollaboratorsInviteController.inviteToProject(
          this.req,
          this.res,
          this.next
        )
      })

      it('should produce json response without an invite', function () {
        this.res.json.callCount.should.equal(1)
        expect(this.res.json.firstCall.args[0]).to.deep.equal({ invite: null })
      })

      it('should not have called _checkShouldInviteEmail', function () {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail.callCount.should.equal(
          0
        )
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail
          .calledWith(this.currentUser, this.targetEmail)
          .should.equal(false)
      })

      it('should not have called inviteToProject', function () {
        this.CollaboratorsInviteHandler.promises.inviteToProject.callCount.should.equal(
          0
        )
      })
    })

    describe('when canAddXCollaborators produces an error', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail =
          sinon.stub().resolves(true)
        this.CollaboratorsInviteController.promises._checkRateLimit = sinon
          .stub()
          .resolves(true)
        this.LimitationsManager.promises.canAddXCollaborators.rejects(
          new Error('woops')
        )
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.inviteToProject(
          this.req,
          this.res,
          this.next
        )
      })

      it('should call next with an error', function () {
        this.next.callCount.should.equal(1)
        this.next.calledWith(sinon.match.instanceOf(Error)).should.equal(true)
      })

      it('should not have called _checkShouldInviteEmail', function () {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail.callCount.should.equal(
          0
        )
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail
          .calledWith(this.currentUser, this.targetEmail)
          .should.equal(false)
      })

      it('should not have called inviteToProject', function () {
        this.CollaboratorsInviteHandler.promises.inviteToProject.callCount.should.equal(
          0
        )
      })
    })

    describe('when inviteToProject produces an error', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail =
          sinon.stub().resolves(true)
        this.CollaboratorsInviteController.promises._checkRateLimit = sinon
          .stub()
          .resolves(true)
        this.CollaboratorsInviteHandler.promises.inviteToProject.rejects(
          new Error('woops')
        )
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.inviteToProject(
          this.req,
          this.res,
          this.next
        )
      })

      it('should call next with an error', function () {
        this.next.callCount.should.equal(1)
        expect(this.next).to.have.been.calledWith(sinon.match.instanceOf(Error))
      })

      it('should have called canAddXCollaborators', function () {
        this.LimitationsManager.promises.canAddXCollaborators.callCount.should.equal(
          1
        )
        this.LimitationsManager.promises.canAddXCollaborators
          .calledWith(this.projectId)
          .should.equal(true)
      })

      it('should have called _checkShouldInviteEmail', function () {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail
          .calledWith(this.targetEmail)
          .should.equal(true)
      })

      it('should have called inviteToProject', function () {
        this.CollaboratorsInviteHandler.promises.inviteToProject.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteHandler.promises.inviteToProject
          .calledWith(
            this.projectId,
            this.currentUser,
            this.targetEmail,
            this.privileges
          )
          .should.equal(true)
      })
    })

    describe('when _checkShouldInviteEmail disallows the invite', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail =
          sinon.stub().resolves(false)
        this.CollaboratorsInviteController.promises._checkRateLimit = sinon
          .stub()
          .resolves(true)
        this.res.callback = () => done()
        this.CollaboratorsInviteController.inviteToProject(
          this.req,
          this.res,
          this.next
        )
      })

      it('should produce json response with no invite, and an error property', function () {
        this.res.json.callCount.should.equal(1)
        expect(this.res.json.firstCall.args[0]).to.deep.equal({
          invite: null,
          error: 'cannot_invite_non_user',
        })
      })

      it('should have called _checkShouldInviteEmail', function () {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail
          .calledWith(this.targetEmail)
          .should.equal(true)
      })

      it('should not have called inviteToProject', function () {
        this.CollaboratorsInviteHandler.promises.inviteToProject.callCount.should.equal(
          0
        )
      })
    })

    describe('when _checkShouldInviteEmail produces an error', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail =
          sinon.stub().rejects(new Error('woops'))
        this.CollaboratorsInviteController.promises._checkRateLimit = sinon
          .stub()
          .resolves(true)
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.inviteToProject(
          this.req,
          this.res,
          this.next
        )
      })

      it('should call next with an error', function () {
        this.next.callCount.should.equal(1)
        this.next.calledWith(sinon.match.instanceOf(Error)).should.equal(true)
      })

      it('should have called _checkShouldInviteEmail', function () {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail
          .calledWith(this.targetEmail)
          .should.equal(true)
      })

      it('should not have called inviteToProject', function () {
        this.CollaboratorsInviteHandler.promises.inviteToProject.callCount.should.equal(
          0
        )
      })
    })

    describe('when the user invites themselves to the project', function () {
      beforeEach(function () {
        this.req.body.email = this.currentUser.email
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail =
          sinon.stub().resolves(true)
        this.CollaboratorsInviteController.promises._checkRateLimit = sinon
          .stub()
          .resolves(true)
        this.CollaboratorsInviteController.inviteToProject(
          this.req,
          this.res,
          this.next
        )
      })

      it('should reject action, return json response with error code', function () {
        this.res.json.callCount.should.equal(1)
        expect(this.res.json.firstCall.args[0]).to.deep.equal({
          invite: null,
          error: 'cannot_invite_self',
        })
      })

      it('should not have called canAddXCollaborators', function () {
        this.LimitationsManager.promises.canAddXCollaborators.callCount.should.equal(
          0
        )
      })

      it('should not have called _checkShouldInviteEmail', function () {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail.callCount.should.equal(
          0
        )
      })

      it('should not have called inviteToProject', function () {
        this.CollaboratorsInviteHandler.promises.inviteToProject.callCount.should.equal(
          0
        )
      })

      it('should not have called emitToRoom', function () {
        this.EditorRealTimeController.emitToRoom.callCount.should.equal(0)
      })
    })

    describe('when _checkRateLimit returns false', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteController.promises._checkShouldInviteEmail =
          sinon.stub().resolves(true)
        this.CollaboratorsInviteController.promises._checkRateLimit = sinon
          .stub()
          .resolves(false)
        this.res.callback = () => done()
        this.CollaboratorsInviteController.inviteToProject(
          this.req,
          this.res,
          this.next
        )
      })

      it('should send a 429 response', function () {
        this.res.sendStatus.calledWith(429).should.equal(true)
      })

      it('should not call inviteToProject', function () {
        this.CollaboratorsInviteHandler.promises.inviteToProject.called.should.equal(
          false
        )
      })

      it('should not call emitToRoom', function () {
        this.EditorRealTimeController.emitToRoom.called.should.equal(false)
      })
    })
  })

  describe('viewInvite', function () {
    beforeEach(function () {
      this.req.params = {
        Project_id: this.projectId,
        token: this.token,
      }
      this.fakeProject = {
        _id: this.projectId,
        name: 'some project',
        owner_ref: this.invite.sendingUserId,
        collaberator_refs: [],
        readOnly_refs: [],
      }
      this.owner = {
        _id: this.fakeProject.owner_ref,
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
      }

      this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.resolves(
        false
      )
      this.CollaboratorsInviteHandler.promises.getInviteByToken.resolves(
        this.invite
      )
      this.ProjectGetter.promises.getProject.resolves(this.fakeProject)
      this.UserGetter.promises.getUser.resolves(this.owner)
    })

    describe('when the token is valid', function () {
      beforeEach(function (done) {
        this.res.callback = () => done()
        this.CollaboratorsInviteController.viewInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should render the view template', function () {
        this.res.render.callCount.should.equal(1)
        this.res.render.calledWith('project/invite/show').should.equal(true)
      })

      it('should not call next', function () {
        this.next.callCount.should.equal(0)
      })

      it('should call CollaboratorsGetter.isUserInvitedMemberOfProject', function () {
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.callCount.should.equal(
          1
        )
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject
          .calledWith(this.currentUser._id, this.projectId)
          .should.equal(true)
      })

      it('should call getInviteByToken', function () {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.callCount.should.equal(
          1
        )
        this.CollaboratorsInviteHandler.promises.getInviteByToken
          .calledWith(this.fakeProject._id, this.invite.token)
          .should.equal(true)
      })

      it('should call User.getUser', function () {
        this.UserGetter.promises.getUser.callCount.should.equal(1)
        this.UserGetter.promises.getUser
          .calledWith({ _id: this.fakeProject.owner_ref })
          .should.equal(true)
      })

      it('should call ProjectGetter.getProject', function () {
        this.ProjectGetter.promises.getProject.callCount.should.equal(1)
        this.ProjectGetter.promises.getProject
          .calledWith(this.projectId)
          .should.equal(true)
      })
    })

    describe('when user is already a member of the project', function () {
      beforeEach(function (done) {
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.resolves(
          true
        )
        this.res.callback = () => done()
        this.CollaboratorsInviteController.viewInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should redirect to the project page', function () {
        this.res.redirect.callCount.should.equal(1)
        this.res.redirect
          .calledWith(`/project/${this.projectId}`)
          .should.equal(true)
      })

      it('should not call next with an error', function () {
        this.next.callCount.should.equal(0)
      })

      it('should call CollaboratorsGetter.isUserInvitedMemberOfProject', function () {
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.callCount.should.equal(
          1
        )
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject
          .calledWith(this.currentUser._id, this.projectId)
          .should.equal(true)
      })

      it('should not call getInviteByToken', function () {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.callCount.should.equal(
          0
        )
      })

      it('should not call User.getUser', function () {
        this.UserGetter.promises.getUser.callCount.should.equal(0)
      })

      it('should not call ProjectGetter.getProject', function () {
        this.ProjectGetter.promises.getProject.callCount.should.equal(0)
      })
    })

    describe('when isUserInvitedMemberOfProject produces an error', function () {
      beforeEach(function (done) {
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.rejects(
          new Error('woops')
        )
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.viewInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should call next with an error', function () {
        this.next.callCount.should.equal(1)
        expect(this.next.firstCall.args[0]).to.be.instanceof(Error)
      })

      it('should call CollaboratorsGetter.isUserInvitedMemberOfProject', function () {
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.callCount.should.equal(
          1
        )
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject
          .calledWith(this.currentUser._id, this.projectId)
          .should.equal(true)
      })

      it('should not call getInviteByToken', function () {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.callCount.should.equal(
          0
        )
      })

      it('should not call User.getUser', function () {
        this.UserGetter.promises.getUser.callCount.should.equal(0)
      })

      it('should not call ProjectGetter.getProject', function () {
        this.ProjectGetter.promises.getProject.callCount.should.equal(0)
      })
    })

    describe('when the getInviteByToken produces an error', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.rejects(
          new Error('woops')
        )
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.viewInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should call next with the error', function () {
        this.next.callCount.should.equal(1)
        this.next.calledWith(sinon.match.instanceOf(Error)).should.equal(true)
      })

      it('should call CollaboratorsGetter.isUserInvitedMemberOfProject', function () {
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.callCount.should.equal(
          1
        )
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject
          .calledWith(this.currentUser._id, this.projectId)
          .should.equal(true)
      })

      it('should call getInviteByToken', function () {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.callCount.should.equal(
          1
        )
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject
          .calledWith(this.currentUser._id, this.projectId)
          .should.equal(true)
      })

      it('should not call User.getUser', function () {
        this.UserGetter.promises.getUser.callCount.should.equal(0)
      })

      it('should not call ProjectGetter.getProject', function () {
        this.ProjectGetter.promises.getProject.callCount.should.equal(0)
      })
    })

    describe('when the getInviteByToken does not produce an invite', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.resolves(null)
        this.res.callback = () => done()
        this.CollaboratorsInviteController.viewInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should render the not-valid view template', function () {
        this.res.render.callCount.should.equal(1)
        this.res.render
          .calledWith('project/invite/not-valid')
          .should.equal(true)
      })

      it('should not call next', function () {
        this.next.callCount.should.equal(0)
      })

      it('should call CollaboratorsGetter.isUserInvitedMemberOfProject', function () {
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.callCount.should.equal(
          1
        )
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject
          .calledWith(this.currentUser._id, this.projectId)
          .should.equal(true)
      })

      it('should call getInviteByToken', function () {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.callCount.should.equal(
          1
        )
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject
          .calledWith(this.currentUser._id, this.projectId)
          .should.equal(true)
      })

      it('should not call User.getUser', function () {
        this.UserGetter.promises.getUser.callCount.should.equal(0)
      })

      it('should not call ProjectGetter.getProject', function () {
        this.ProjectGetter.promises.getProject.callCount.should.equal(0)
      })
    })

    describe('when User.getUser produces an error', function () {
      beforeEach(function (done) {
        this.UserGetter.promises.getUser.rejects(new Error('woops'))
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.viewInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should produce an error', function () {
        this.next.callCount.should.equal(1)
        expect(this.next.firstCall.args[0]).to.be.instanceof(Error)
      })

      it('should call CollaboratorsGetter.isUserInvitedMemberOfProject', function () {
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.callCount.should.equal(
          1
        )
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject
          .calledWith(this.currentUser._id, this.projectId)
          .should.equal(true)
      })

      it('should call getInviteByToken', function () {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.callCount.should.equal(
          1
        )
      })

      it('should call User.getUser', function () {
        this.UserGetter.promises.getUser.callCount.should.equal(1)
        this.UserGetter.promises.getUser
          .calledWith({ _id: this.fakeProject.owner_ref })
          .should.equal(true)
      })

      it('should not call ProjectGetter.getProject', function () {
        this.ProjectGetter.promises.getProject.callCount.should.equal(0)
      })
    })

    describe('when User.getUser does not find a user', function () {
      beforeEach(function (done) {
        this.UserGetter.promises.getUser.resolves(null)
        this.res.callback = () => done()
        this.CollaboratorsInviteController.viewInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should render the not-valid view template', function () {
        this.res.render.callCount.should.equal(1)
        this.res.render
          .calledWith('project/invite/not-valid')
          .should.equal(true)
      })

      it('should not call next', function () {
        this.next.callCount.should.equal(0)
      })

      it('should call CollaboratorsGetter.isUserInvitedMemberOfProject', function () {
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.callCount.should.equal(
          1
        )
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject
          .calledWith(this.currentUser._id, this.projectId)
          .should.equal(true)
      })

      it('should call getInviteByToken', function () {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.callCount.should.equal(
          1
        )
      })

      it('should call User.getUser', function () {
        this.UserGetter.promises.getUser.callCount.should.equal(1)
        this.UserGetter.promises.getUser
          .calledWith({ _id: this.fakeProject.owner_ref })
          .should.equal(true)
      })

      it('should not call ProjectGetter.getProject', function () {
        this.ProjectGetter.promises.getProject.callCount.should.equal(0)
      })
    })

    describe('when getProject produces an error', function () {
      beforeEach(function (done) {
        this.ProjectGetter.promises.getProject.rejects(new Error('woops'))
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.viewInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should produce an error', function () {
        this.next.callCount.should.equal(1)
        expect(this.next.firstCall.args[0]).to.be.instanceof(Error)
      })

      it('should call CollaboratorsGetter.isUserInvitedMemberOfProject', function () {
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.callCount.should.equal(
          1
        )
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject
          .calledWith(this.currentUser._id, this.projectId)
          .should.equal(true)
      })

      it('should call getInviteByToken', function () {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.callCount.should.equal(
          1
        )
      })

      it('should call User.getUser', function () {
        this.UserGetter.promises.getUser.callCount.should.equal(1)
        this.UserGetter.promises.getUser
          .calledWith({ _id: this.fakeProject.owner_ref })
          .should.equal(true)
      })

      it('should call ProjectGetter.getProject', function () {
        this.ProjectGetter.promises.getProject.callCount.should.equal(1)
      })
    })

    describe('when Project.getUser does not find a user', function () {
      beforeEach(function (done) {
        this.ProjectGetter.promises.getProject.resolves(null)
        this.res.callback = () => done()
        this.CollaboratorsInviteController.viewInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should render the not-valid view template', function () {
        this.res.render.callCount.should.equal(1)
        this.res.render
          .calledWith('project/invite/not-valid')
          .should.equal(true)
      })

      it('should not call next', function () {
        this.next.callCount.should.equal(0)
      })

      it('should call CollaboratorsGetter.isUserInvitedMemberOfProject', function () {
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject.callCount.should.equal(
          1
        )
        this.CollaboratorsGetter.promises.isUserInvitedMemberOfProject
          .calledWith(this.currentUser._id, this.projectId)
          .should.equal(true)
      })

      it('should call getInviteByToken', function () {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.callCount.should.equal(
          1
        )
      })

      it('should call getUser', function () {
        this.UserGetter.promises.getUser.callCount.should.equal(1)
        this.UserGetter.promises.getUser
          .calledWith({ _id: this.fakeProject.owner_ref })
          .should.equal(true)
      })

      it('should call ProjectGetter.getProject', function () {
        this.ProjectGetter.promises.getProject.callCount.should.equal(1)
      })
    })
  })

  describe('resendInvite', function () {
    beforeEach(function () {
      this.req.params = {
        Project_id: this.projectId,
        invite_id: this.invite._id.toString(),
      }
      this.CollaboratorsInviteController.promises._checkRateLimit = sinon
        .stub()
        .resolves(true)
    })

    describe('when resendInvite does not produce an error', function () {
      beforeEach(function (done) {
        this.res.callback = () => done()
        this.CollaboratorsInviteController.resendInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should produce a 201 response', function () {
        this.res.sendStatus.callCount.should.equal(1)
        this.res.sendStatus.calledWith(201).should.equal(true)
      })

      it('should have called resendInvite', function () {
        this.CollaboratorsInviteHandler.promises.resendInvite.callCount.should.equal(
          1
        )
      })

      it('should check the rate limit', function () {
        this.CollaboratorsInviteController.promises._checkRateLimit.callCount.should.equal(
          1
        )
      })

      it('should add a project audit log entry', function () {
        this.ProjectAuditLogHandler.addEntryInBackground.should.have.been.calledWith(
          this.projectId,
          'resend-invite',
          this.currentUser._id,
          this.req.ip,
          {
            inviteId: this.invite._id,
            privileges: this.privileges,
          }
        )
      })
    })

    describe('when resendInvite produces an error', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteHandler.promises.resendInvite.rejects(
          new Error('woops')
        )
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.resendInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should not produce a 201 response', function () {
        this.res.sendStatus.callCount.should.equal(0)
      })

      it('should call next with the error', function () {
        this.next.callCount.should.equal(1)
        this.next.calledWith(sinon.match.instanceOf(Error)).should.equal(true)
      })

      it('should have called resendInvite', function () {
        this.CollaboratorsInviteHandler.promises.resendInvite.callCount.should.equal(
          1
        )
      })
    })
  })

  describe('revokeInvite', function () {
    beforeEach(function () {
      this.req.params = {
        Project_id: this.projectId,
        invite_id: this.invite._id.toString(),
      }
    })

    describe('when revokeInvite does not produce an error', function () {
      beforeEach(function (done) {
        this.res.callback = () => done()
        this.CollaboratorsInviteController.revokeInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should produce a 204 response', function () {
        this.res.sendStatus.callCount.should.equal(1)
        this.res.sendStatus.should.have.been.calledWith(204)
      })

      it('should have called revokeInvite', function () {
        this.CollaboratorsInviteHandler.promises.revokeInvite.callCount.should.equal(
          1
        )
      })

      it('should have called emitToRoom', function () {
        this.EditorRealTimeController.emitToRoom.callCount.should.equal(1)
        this.EditorRealTimeController.emitToRoom
          .calledWith(this.projectId, 'project:membership:changed')
          .should.equal(true)
      })

      it('should add a project audit log entry', function () {
        this.ProjectAuditLogHandler.addEntryInBackground.should.have.been.calledWith(
          this.projectId,
          'revoke-invite',
          this.currentUser._id,
          this.req.ip,
          {
            inviteId: this.invite._id,
            privileges: this.privileges,
          }
        )
      })
    })

    describe('when revokeInvite produces an error', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteHandler.promises.revokeInvite.rejects(
          new Error('woops')
        )
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.revokeInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should not produce a 201 response', function () {
        this.res.sendStatus.callCount.should.equal(0)
      })

      it('should call next with the error', function () {
        this.next.callCount.should.equal(1)
        this.next.calledWith(sinon.match.instanceOf(Error)).should.equal(true)
      })

      it('should have called revokeInvite', function () {
        this.CollaboratorsInviteHandler.promises.revokeInvite.callCount.should.equal(
          1
        )
      })
    })
  })

  describe('acceptInvite', function () {
    beforeEach(function () {
      this.req.params = {
        Project_id: this.projectId,
        token: this.token,
      }
    })

    describe('when acceptInvite does not produce an error', function () {
      beforeEach(function (done) {
        this.res.callback = () => done()
        this.CollaboratorsInviteController.acceptInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should redirect to project page', function () {
        this.res.redirect.should.have.been.calledOnce
        this.res.redirect.should.have.been.calledWith(
          `/project/${this.projectId}`
        )
      })

      it('should have called acceptInvite', function () {
        this.CollaboratorsInviteHandler.promises.acceptInvite.should.have.been.calledWith(
          this.invite,
          this.projectId,
          this.currentUser
        )
      })

      it('should have called emitToRoom', function () {
        this.EditorRealTimeController.emitToRoom.should.have.been.calledOnce
        this.EditorRealTimeController.emitToRoom.should.have.been.calledWith(
          this.projectId,
          'project:membership:changed'
        )
      })

      it('should add a project audit log entry', function () {
        this.ProjectAuditLogHandler.promises.addEntry.should.have.been.calledWith(
          this.projectId,
          'accept-invite',
          this.currentUser._id,
          this.req.ip,
          {
            inviteId: this.invite._id,
            privileges: this.privileges,
          }
        )
      })
    })

    describe('when the invite is not found', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteHandler.promises.getInviteByToken.resolves(null)
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.acceptInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('throws a NotFoundError', function () {
        expect(this.next).to.have.been.calledWith(
          sinon.match.instanceOf(Errors.NotFoundError)
        )
      })
    })

    describe('when acceptInvite produces an error', function () {
      beforeEach(function (done) {
        this.CollaboratorsInviteHandler.promises.acceptInvite.rejects(
          new Error('woops')
        )
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.acceptInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should not redirect to project page', function () {
        this.res.redirect.callCount.should.equal(0)
      })

      it('should call next with the error', function () {
        this.next.callCount.should.equal(1)
        this.next.calledWith(sinon.match.instanceOf(Error)).should.equal(true)
      })

      it('should have called acceptInvite', function () {
        this.CollaboratorsInviteHandler.promises.acceptInvite.callCount.should.equal(
          1
        )
      })
    })

    describe('when the project audit log entry fails', function () {
      beforeEach(function (done) {
        this.ProjectAuditLogHandler.promises.addEntry.rejects(new Error('oops'))
        this.next.callsFake(() => done())
        this.CollaboratorsInviteController.acceptInvite(
          this.req,
          this.res,
          this.next
        )
      })

      it('should not accept the invite', function () {
        this.CollaboratorsInviteHandler.promises.acceptInvite.should.not.have
          .been.called
      })
    })
  })

  describe('_checkShouldInviteEmail', function () {
    beforeEach(function () {
      this.email = 'user@example.com'
    })

    describe('when we should be restricting to existing accounts', function () {
      beforeEach(function () {
        this.settings.restrictInvitesToExistingAccounts = true
        this.call = callback => {
          this.CollaboratorsInviteController._checkShouldInviteEmail(
            this.email,
            callback
          )
        }
      })

      describe('when user account is present', function () {
        beforeEach(function () {
          this.user = { _id: ObjectId().toString() }
          this.UserGetter.promises.getUserByAnyEmail.resolves(this.user)
        })

        it('should callback with `true`', function (done) {
          this.call((err, shouldAllow) => {
            expect(err).to.equal(null)
            expect(shouldAllow).to.equal(true)
            done()
          })
        })
      })

      describe('when user account is absent', function () {
        beforeEach(function () {
          this.user = null
          this.UserGetter.promises.getUserByAnyEmail.resolves(this.user)
        })

        it('should callback with `false`', function (done) {
          this.call((err, shouldAllow) => {
            expect(err).to.equal(null)
            expect(shouldAllow).to.equal(false)
            done()
          })
        })

        it('should have called getUser', function (done) {
          this.call((err, shouldAllow) => {
            if (err) {
              return done(err)
            }
            this.UserGetter.promises.getUserByAnyEmail.callCount.should.equal(1)
            this.UserGetter.promises.getUserByAnyEmail
              .calledWith(this.email, { _id: 1 })
              .should.equal(true)
            done()
          })
        })
      })

      describe('when getUser produces an error', function () {
        beforeEach(function () {
          this.user = null
          this.UserGetter.promises.getUserByAnyEmail.rejects(new Error('woops'))
        })

        it('should callback with an error', function (done) {
          this.call((err, shouldAllow) => {
            expect(err).to.not.equal(null)
            expect(err).to.be.instanceof(Error)
            expect(shouldAllow).to.equal(undefined)
            done()
          })
        })
      })
    })
  })

  describe('_checkRateLimit', function () {
    beforeEach(function () {
      this.settings.restrictInvitesToExistingAccounts = false
      this.currentUserId = '32312313'
      this.LimitationsManager.promises.allowedNumberOfCollaboratorsForUser
        .withArgs(this.currentUserId)
        .resolves(17)
    })

    it('should callback with `true` when rate limit under', function (done) {
      this.CollaboratorsInviteController._checkRateLimit(
        this.currentUserId,
        (err, result) => {
          if (err) {
            return done(err)
          }
          expect(this.rateLimiter.consume).to.have.been.calledWith(
            this.currentUserId
          )
          result.should.equal(true)
          done()
        }
      )
    })

    it('should callback with `false` when rate limit hit', function (done) {
      this.rateLimiter.consume.rejects({ remainingPoints: 0 })
      this.CollaboratorsInviteController._checkRateLimit(
        this.currentUserId,
        (err, result) => {
          if (err) {
            return done(err)
          }
          expect(this.rateLimiter.consume).to.have.been.calledWith(
            this.currentUserId
          )
          result.should.equal(false)
          done()
        }
      )
    })

    it('should allow 10x the collaborators', function (done) {
      this.CollaboratorsInviteController._checkRateLimit(
        this.currentUserId,
        (err, result) => {
          if (err) {
            return done(err)
          }
          expect(this.rateLimiter.consume).to.have.been.calledWith(
            this.currentUserId,
            Math.floor(40000 / 170)
          )
          done()
        }
      )
    })

    it('should allow 200 requests when collaborators is -1', function (done) {
      this.LimitationsManager.promises.allowedNumberOfCollaboratorsForUser
        .withArgs(this.currentUserId)
        .resolves(-1)
      this.CollaboratorsInviteController._checkRateLimit(
        this.currentUserId,
        (err, result) => {
          if (err) {
            return done(err)
          }
          expect(this.rateLimiter.consume).to.have.been.calledWith(
            this.currentUserId,
            Math.floor(40000 / 200)
          )
          done()
        }
      )
    })

    it('should allow 10 requests when user has no collaborators set', function (done) {
      this.LimitationsManager.promises.allowedNumberOfCollaboratorsForUser
        .withArgs(this.currentUserId)
        .resolves(null)
      this.CollaboratorsInviteController._checkRateLimit(
        this.currentUserId,
        (err, result) => {
          if (err) {
            return done(err)
          }
          expect(this.rateLimiter.consume).to.have.been.calledWith(
            this.currentUserId,
            Math.floor(40000 / 10)
          )
          done()
        }
      )
    })
  })
})

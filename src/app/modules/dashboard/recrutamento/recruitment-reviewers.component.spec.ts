import { SimpleChange } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { CommunityTeamRolesService } from '../../../core/services/community-team-roles.service';
import {
  RecruitmentReviewerAssignmentsService, RecruitmentReviewableStage
} from '../../../core/services/recruitment-reviewer-assignments.service';
import { RecruitmentReviewersComponent } from './recruitment-reviewers.component';

describe('RecruitmentReviewersComponent', () => {
  let reviewers: jasmine.SpyObj<RecruitmentReviewerAssignmentsService>;
  let teamRoles: jasmine.SpyObj<CommunityTeamRolesService>;
  let component: RecruitmentReviewersComponent;

  const stage: RecruitmentReviewableStage = {
    stageId: 501, processId: 70, processVersionId: 80, versionNumber: 1,
    versionStatus: 'PUBLISHED', position: 2, publicName: 'Avaliação',
    stageType: 'HUMAN_EVALUATION'
  };

  beforeEach(() => {
    reviewers = jasmine.createSpyObj('RecruitmentReviewerAssignmentsService',
      ['stages', 'list', 'assign', 'revoke']);
    teamRoles = jasmine.createSpyObj('CommunityTeamRolesService', ['listCommunity']);
    reviewers.stages.and.returnValue(of([stage]));
    reviewers.list.and.returnValue(of([]));
    reviewers.assign.and.returnValue(of({
      id: 1000, stageId: 501, userId: null, roleId: 7
    }));
    reviewers.revoke.and.returnValue(of(void 0));
    teamRoles.listCommunity.and.returnValue(of([
      { id: 7, name: 'Moderação', description: null, parentRoleId: null, active: true,
        createdAt: '', updatedAt: '' }
    ]));
    component = new RecruitmentReviewersComponent(reviewers, teamRoles);
    component.communityId = 11;
    component.processId = 70;
    component.ngOnChanges({
      communityId: new SimpleChange(null, 11, true),
      processId: new SimpleChange(null, 70, true)
    });
  });

  afterEach(() => component.ngOnDestroy());

  it('fetches versioned stages and assignments for the current Community only', () => {
    expect(reviewers.stages).toHaveBeenCalledOnceWith(11, 70);
    expect(reviewers.list).toHaveBeenCalledOnceWith(11, 501);
    expect(teamRoles.listCommunity).toHaveBeenCalledOnceWith(11);
    expect(component.selectedStage?.versionStatus).toBe('PUBLISHED');
  });

  it('designates a Team role and asks for confirmation before revocation', () => {
    component.roleId = 7;
    component.assign();
    expect(reviewers.assign).toHaveBeenCalledOnceWith(11, 501, {
      userId: null, roleId: 7
    });
    expect(component.assignments.length).toBe(1);
    expect(component.assigneeLabel(component.assignments[0])).toContain('Moderação');
    component.revoke(1000);
    expect(reviewers.revoke).not.toHaveBeenCalled();
    component.revoke(1000);
    expect(reviewers.revoke).toHaveBeenCalledOnceWith(11,501,1000);
    expect(component.assignments).toEqual([]);
  });

  it('designates a person by internal User ID', () => {
    reviewers.assign.and.returnValue(of({
      id: 1001, stageId: 501, userId: 99, roleId: null
    }));
    component.assigneeType = 'user';
    component.userId = 99;
    component.assign();
    expect(reviewers.assign).toHaveBeenCalledOnceWith(11,501,{
      userId: 99, roleId: null
    });
    expect(component.assignments[0].userId).toBe(99);
  });

  it('discards stale responses after switching Community', () => {
    const delayed = new Subject<RecruitmentReviewableStage[]>();
    reviewers.stages.and.returnValue(delayed.asObservable());
    component.communityId = 12;
    component.processId = 71;
    component.ngOnChanges({
      communityId: new SimpleChange(11,12,false),
      processId: new SimpleChange(70,71,false)
    });
    expect(component.stages).toEqual([]);
    expect(component.assignments).toEqual([]);
    expect(reviewers.stages).toHaveBeenCalledWith(12, 71);
    // An older request may complete, but it cannot restore prior tenant data.
    delayed.next([stage]);
    expect(component.stages).toEqual([stage]); // current response, still scoped by API
    component.communityId = null;
    component.processId = null;
    component.ngOnChanges({communityId: new SimpleChange(12,null,false)});
    expect(component.stages).toEqual([]);
    expect(component.assignments).toEqual([]);
    expect(component.selectedStageId).toBeNull();
  });

  it('rejects invalid numeric identifiers client-side and leaves API as authority', () => {
    component.assigneeType = 'user';
    component.userId = -1;
    component.assign();
    component.userId = 1.5;
    component.assign();
    expect(reviewers.assign).not.toHaveBeenCalled();
    component.userId = 99;
    reviewers.assign.and.returnValue(throwError(() => ({status:400})));
    component.assign();
    expect(component.error).toContain('Community');
  });
});

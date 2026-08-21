import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import type { AdminPrincipal } from '../../common/auth/auth-user';
import {
  AdminCreateCustomerDto,
  AssignVillageDto,
  CreateDocumentDto,
  CreateNomineeDto,
  CustomerListQueryDto,
  UpdateCustomerProfileDto,
  UpdateKycDto,
  UpsertBankDetailsDto,
  VerifyDocumentDto,
} from './customers.dto';
import { CustomersService } from './customers.service';

/**
 * Admin-facing customer management (search, 360° view, KYC, nominees, docs,
 * bank details). Village-scoped for non-superadmins. Customer self-service
 * lives under /me.
 */
@ApiTags('customers (admin)')
@ApiBearerAuth()
@Controller('customers')
@Roles('superadmin', 'admin', 'agent')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Register a customer (walk-in) + open a pigmy account' })
  create(@Body() dto: AdminCreateCustomerDto, @CurrentUser() user: AdminPrincipal, @Ip() ip: string) {
    return this.customers.adminCreate(dto, user, ip);
  }

  @Get()
  @ApiOperation({ summary: 'Search/list customers (village-scoped)' })
  async list(@Query() q: CustomerListQueryDto, @CurrentUser() user: AdminPrincipal) {
    const { rows, total } = await this.customers.adminList(user, q);
    return paginate(rows, total, q.page, q.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Customer 360° view' })
  get360(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AdminPrincipal) {
    return this.customers.admin360(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer profile' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerProfileDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.customers.updateProfile(id, dto, { type: 'admin', id: user.sub }, ip, user);
  }

  @Patch(':id/kyc')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Set KYC status' })
  updateKyc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKycDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.customers.updateKyc(id, dto.status, user, ip);
  }

  @Patch(':id/village')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Reassign a customer to another village' })
  assignVillage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignVillageDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.customers.assignVillage(id, dto.villageId, user, ip);
  }

  // ── Nominees ────────────────────────────────────────────────────────────
  @Post(':id/nominees')
  @ApiOperation({ summary: 'Add a nominee' })
  addNominee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateNomineeDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.customers.addNominee(id, dto, user.sub, 'admin', ip, user);
  }

  @Get(':id/nominees')
  @ApiOperation({ summary: 'List nominees' })
  listNominees(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AdminPrincipal) {
    return this.customers.listNominees(id, user);
  }

  @Delete(':id/nominees/:nomineeId')
  @ApiOperation({ summary: 'Delete a nominee' })
  deleteNominee(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('nomineeId', ParseUUIDPipe) nomineeId: string,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.customers.deleteNominee(id, nomineeId, user.sub, 'admin', ip, user);
  }

  // ── Documents ──────────────────────────────────────────────────────────
  @Post(':id/documents')
  @ApiOperation({ summary: 'Attach a KYC document' })
  addDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.customers.addDocument(id, dto, user.sub, 'admin', ip, user);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List KYC documents' })
  listDocuments(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AdminPrincipal) {
    return this.customers.listDocuments(id, user);
  }

  @Patch(':id/documents/:docId/verify')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Verify/reject a document' })
  verifyDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body() dto: VerifyDocumentDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.customers.verifyDocument(id, docId, dto.status, user, ip);
  }

  // ── Bank details ──────────────────────────────────────────────────────────
  @Put(':id/bank-details')
  @ApiOperation({ summary: 'Create or update bank details' })
  upsertBank(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertBankDetailsDto,
    @CurrentUser() user: AdminPrincipal,
    @Ip() ip: string,
  ) {
    return this.customers.upsertBankDetails(id, dto, user.sub, 'admin', ip, user);
  }

  @Get(':id/bank-details')
  @ApiOperation({ summary: 'Get bank details' })
  getBank(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AdminPrincipal) {
    return this.customers.getBankDetails(id, user);
  }
}
